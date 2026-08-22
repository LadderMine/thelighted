// backend/src/modules/payments/loyalty-payout.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { QueryFailedError, Repository } from 'typeorm';
import { Keypair, NotFoundError } from '@stellar/stellar-sdk';
import { Order } from '../orders/order.entity';
import { Payment } from './payment.entity';
import { LoyaltyPayout, LoyaltyPayoutStatus } from './loyalty-payout.entity';
import { StellarService } from './stellar.service';
import { SequenceAllocator } from './sequence-allocator.service';
import { PaymentsGateway } from './payments.gateway';
import { assertValidPayoutTransition } from './loyalty-payout-state-machine';
import {
  isDefinitiveHorizonRejection,
  mapHorizonSubmissionError,
} from './errors/horizon-error-mapper';

// Postgres unique_violation — see PaymentsService.createPayment for the
// identical pattern this mirrors.
const POSTGRES_UNIQUE_VIOLATION = '23505';

const BASE_RETRY_BACKOFF_SECONDS = 30;
const MAX_RETRY_BACKOFF_SECONDS = 300;

export interface LoyaltyPayoutSummary {
  submitted: number;
  confirmed: number;
  failed: number;
  stillPending: number;
}

/**
 * Issues loyalty tokens to a diner after their payment confirms — a
 * platform-signed transaction (issue #316 / ADR 0004), genuinely separate
 * from and independently-retryable from the (diner-signed, possibly
 * fee-split) primary payment. Two jobs on its own schedule, mirroring
 * PaymentReconciliationService's shape:
 *
 *  1. Submit every PENDING (or backed-off FAILED) payout: build, sign with
 *     the platform's loyalty issuer key, and send to Horizon.
 *  2. For every SUBMITTED payout, independently verify against Horizon by
 *     hash — the only path allowed to set CONFIRMED.
 */
@Injectable()
export class LoyaltyPayoutService implements OnModuleInit {
  private readonly logger = new Logger(LoyaltyPayoutService.name);
  private issuerKeypair: Keypair;
  private assetCode: string;
  private rateBps: number;

  constructor(
    @InjectRepository(LoyaltyPayout)
    private readonly payoutRepository: Repository<LoyaltyPayout>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    private readonly stellarService: StellarService,
    private readonly sequenceAllocator: SequenceAllocator,
    private readonly configService: ConfigService,
    private readonly paymentsGateway: PaymentsGateway,
  ) {}

  // Fail fast at boot, mirroring StellarService.onModuleInit (issue #312's
  // pattern) — a missing/invalid loyalty issuer key should never surface
  // only when the first order confirms.
  onModuleInit(): void {
    const secret = this.configService.get<string>('LOYALTY_ISSUER_SECRET');
    if (!secret) {
      throw new Error(
        'LoyaltyPayoutService: LOYALTY_ISSUER_SECRET is not configured',
      );
    }

    try {
      this.issuerKeypair = Keypair.fromSecret(secret);
    } catch {
      // Deliberately a fresh message, never the caught error's own — some
      // SDK versions can echo fragments of malformed input in their error
      // text, and this secret must never appear anywhere in logs (issue
      // #316 acceptance criteria: "no secret key material in logs").
      throw new Error(
        'LoyaltyPayoutService: LOYALTY_ISSUER_SECRET is not a valid Stellar secret key',
      );
    }

    this.assetCode = this.configService.get<string>(
      'LOYALTY_ASSET_CODE',
      'BITE',
    );
    this.rateBps = Number(
      this.configService.get<string>('LOYALTY_RATE_BPS', '1000'),
    );

    this.logger.log(
      `Loyalty payout service ready (asset=${this.assetCode}, issuer=${this.issuerKeypair.publicKey()}, rateBps=${this.rateBps})`,
    );
  }

  /**
   * Computes the loyalty amount owed for a confirmed payment and persists
   * a PENDING payout row — fast, no Horizon call, so it never adds latency
   * to payment confirmation itself. Actual submission happens on this
   * service's own scheduled tick.
   *
   * Idempotent: `paymentId` is unique at the DB level (mirrors
   * PaymentsService.createPayment's race-handling), so calling this twice
   * for the same payment — e.g. a defensive re-call, or two reconciliation
   * ticks somehow overlapping — never creates a second payout.
   */
  async createForConfirmedPayment(payment: Payment): Promise<void> {
    const amount = this.computeLoyaltyAmount(payment.amount);
    if (amount <= 0) return;

    const payout = this.payoutRepository.create({
      paymentId: payment.id,
      orderId: payment.orderId,
      destinationAccount: payment.sourceAccount,
      assetCode: this.assetCode,
      assetIssuer: this.issuerKeypair.publicKey(),
      amount,
      status: LoyaltyPayoutStatus.PENDING,
    });

    try {
      const saved = await this.payoutRepository.save(payout);
      this.logger.log(
        `Loyalty payout ${saved.id} created for payment ${payment.id} (order ${payment.orderId}): ${amount} ${this.assetCode}`,
      );
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        // Already exists — not an error. Exactly one payout per payment,
        // guaranteed by the paymentId unique constraint, not just this
        // best-effort check.
        return;
      }
      throw error;
    }
  }

  computeLoyaltyAmount(paymentAmount: number | string): number {
    const raw = (Number(paymentAmount) * this.rateBps) / 10_000;
    return Math.round(raw * 1e7) / 1e7; // clamp to Stellar's 7-decimal precision
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async handleCron(): Promise<void> {
    const summary = await this.processPending();
    if (summary.submitted > 0 || summary.confirmed > 0 || summary.failed > 0) {
      this.logger.log(`Loyalty payout pass: ${JSON.stringify(summary)}`);
    }
  }

  async processPending(
    now: Date = new Date(),
  ): Promise<LoyaltyPayoutSummary> {
    const summary: LoyaltyPayoutSummary = {
      submitted: 0,
      confirmed: 0,
      failed: 0,
      stillPending: 0,
    };

    await this.submitEligible(now, summary);
    await this.confirmSubmitted(summary);

    return summary;
  }

  private async submitEligible(
    now: Date,
    summary: LoyaltyPayoutSummary,
  ): Promise<void> {
    const pending = await this.payoutRepository.find({
      where: { status: LoyaltyPayoutStatus.PENDING },
    });
    const failed = await this.payoutRepository.find({
      where: { status: LoyaltyPayoutStatus.FAILED },
    });
    const eligible = [
      ...pending,
      ...failed.filter((payout) => this.isBackoffElapsed(payout, now)),
    ];

    for (const payout of eligible) {
      await this.submitOne(payout, summary);
    }
  }

  private isBackoffElapsed(payout: LoyaltyPayout, now: Date): boolean {
    if (!payout.lastAttemptAt) return true;
    const backoffSeconds = Math.min(
      BASE_RETRY_BACKOFF_SECONDS * 2 ** payout.attemptCount,
      MAX_RETRY_BACKOFF_SECONDS,
    );
    return (
      now.getTime() - new Date(payout.lastAttemptAt).getTime() >=
      backoffSeconds * 1000
    );
  }

  private async submitOne(
    payout: LoyaltyPayout,
    summary: LoyaltyPayoutSummary,
  ): Promise<void> {
    const issuerPublicKey = this.issuerKeypair.publicKey();

    try {
      const sequence = await this.sequenceAllocator.allocate(issuerPublicKey);
      const unsignedXdr = await this.stellarService.buildPaymentTransaction({
        sourceAccount: issuerPublicKey,
        destinationAccount: payout.destinationAccount,
        assetCode: payout.assetCode,
        assetIssuer: payout.assetIssuer,
        amount: Number(payout.amount).toFixed(7),
        memo: `loyalty:${payout.orderId}`.slice(0, 28),
        sequenceOverride: sequence,
      });
      const signedXdr = this.stellarService.signTransactionWithKeypair(
        unsignedXdr,
        this.issuerKeypair,
      );
      const stellarTxHash =
        this.stellarService.computeTransactionHash(signedXdr);

      assertValidPayoutTransition(payout.status, LoyaltyPayoutStatus.SUBMITTED);
      payout.status = LoyaltyPayoutStatus.SUBMITTED;
      payout.stellarTxHash = stellarTxHash;
      payout.attemptCount += 1;
      payout.lastAttemptAt = new Date();
      await this.payoutRepository.save(payout);

      try {
        await this.stellarService.submitTransaction(signedXdr);
        summary.submitted++;
      } catch (error) {
        if (!isDefinitiveHorizonRejection(error)) {
          // Ambiguous — same reasoning as PaymentsService.submitSigned:
          // leave it SUBMITTED for the confirm pass to resolve by hash,
          // rather than risk marking a possibly-successful payout FAILED.
          this.logger.warn(
            `Ambiguous submit error for loyalty payout ${payout.id} (tx ${stellarTxHash}); leaving SUBMITTED for reconciliation: ` +
              (error instanceof Error ? error.message : String(error)),
          );
          summary.submitted++;
          return;
        }

        const mapped = mapHorizonSubmissionError(error);
        if (mapped.code === 'SEQUENCE_CONFLICT') {
          this.sequenceAllocator.invalidate(issuerPublicKey);
        }
        await this.markFailed(payout, mapped.code, summary);
      }
    } catch (error) {
      await this.markFailed(
        payout,
        error instanceof Error ? error.message : 'PAYOUT_BUILD_FAILED',
        summary,
      );
    }
  }

  private async confirmSubmitted(
    summary: LoyaltyPayoutSummary,
  ): Promise<void> {
    const submitted = await this.payoutRepository.find({
      where: { status: LoyaltyPayoutStatus.SUBMITTED },
    });

    for (const payout of submitted) {
      if (!payout.stellarTxHash) {
        summary.stillPending++;
        continue;
      }

      try {
        const record = await this.stellarService.fetchTransaction(
          payout.stellarTxHash,
        );

        if (record.successful) {
          assertValidPayoutTransition(
            payout.status,
            LoyaltyPayoutStatus.CONFIRMED,
          );
          payout.status = LoyaltyPayoutStatus.CONFIRMED;
          payout.confirmedAt = new Date();
          const saved = await this.payoutRepository.save(payout);
          this.logger.log(
            `Loyalty payout ${saved.id} confirmed (order ${saved.orderId}, tx ${saved.stellarTxHash})`,
          );
          summary.confirmed++;
          await this.emitStatusChanged(saved);
        } else {
          await this.markFailed(payout, 'SUBMISSION_FAILED', summary);
        }
      } catch (error) {
        if (error instanceof NotFoundError) {
          // Expected for a short window after submission — bounded
          // retrying happens on the next scheduled tick, same as
          // PaymentReconciliationService's propagation-delay handling.
          summary.stillPending++;
          continue;
        }
        this.logger.warn(
          `Loyalty payout confirmation check failed for ${payout.id}: ` +
            (error instanceof Error ? error.message : String(error)),
        );
        summary.stillPending++;
      }
    }
  }

  private async markFailed(
    payout: LoyaltyPayout,
    reason: string,
    summary: LoyaltyPayoutSummary,
  ): Promise<void> {
    // A retried payout can fail again before ever reaching SUBMITTED
    // (e.g. sequence allocation itself throws) — that's recording another
    // failed attempt on an already-FAILED row, not a state transition, so
    // the legality check only applies when actually crossing into FAILED
    // from a different status (FAILED -> FAILED isn't a modeled edge in
    // loyalty-payout-state-machine.ts, and shouldn't need to be).
    if (payout.status !== LoyaltyPayoutStatus.FAILED) {
      assertValidPayoutTransition(payout.status, LoyaltyPayoutStatus.FAILED);
      payout.status = LoyaltyPayoutStatus.FAILED;
    }
    payout.failureReason = reason;
    payout.attemptCount += 1;
    payout.lastAttemptAt = new Date();
    const saved = await this.payoutRepository.save(payout);
    this.logger.warn(
      `Loyalty payout ${saved.id} failed (order ${saved.orderId}, attempt ${saved.attemptCount}): ${reason}`,
    );
    summary.failed++;
    await this.emitStatusChanged(saved);
  }

  private async emitStatusChanged(payout: LoyaltyPayout): Promise<void> {
    const order = await this.orderRepository.findOne({
      where: { id: payout.orderId },
    });
    if (!order) return;

    this.paymentsGateway.emitLoyaltyPayoutStatusChanged(order.restaurantId, {
      payoutId: payout.id,
      paymentId: payout.paymentId,
      orderId: payout.orderId,
      status: payout.status,
      stellarTxHash: payout.stellarTxHash,
      failureReason: payout.failureReason,
      updatedAt: new Date().toISOString(),
    });
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      (error as unknown as { code?: string }).code ===
        POSTGRES_UNIQUE_VIOLATION
    );
  }
}
