// backend/src/modules/payments/payment-reconciliation.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LessThan, Repository } from 'typeorm';
import { NotFoundError } from '@stellar/stellar-sdk';
import { Order, OrderStatus } from '../orders/order.entity';
import { Payment, PaymentStatus } from './payment.entity';
import { StellarService } from './stellar.service';
import { PaymentsGateway } from './payments.gateway';
import { LoyaltyPayoutService } from './loyalty-payout.service';
import { assertValidTransition } from './payment-state-machine';

export interface ReconciliationSummary {
  checked: number;
  confirmed: number;
  failed: number;
  stillPending: number;
  expired: number;
}

/**
 * Independent-verification worker and safety net (issue #314). Two jobs:
 *
 *  1. For every SUBMITTED payment, ask Horizon directly (by hash) whether
 *     it actually landed — this is the ONLY path that may set CONFIRMED.
 *     Runs on a short interval so confirmation latency stays close to
 *     Stellar's real ~3-5s settlement time. (A streaming/SSE fast path is
 *     a documented follow-up — see the class-level note below — polling
 *     alone already satisfies this issue's correctness requirements.)
 *  2. Expires PENDING/SUBMITTED payments whose transaction timebounds have
 *     passed without a confirmation ever landing — explicitly EXPIRED, not
 *     FAILED, so the API/UI can tell "never charged" apart from "charge
 *     attempted and rejected."
 *
 * Streaming note: Horizon's SSE stream (`server.transactions().stream()`)
 * would get confirmations closer to the moment they land instead of
 * waiting for the next poll tick, but a stream subscription needs its own
 * reconnect/backfill handling to be safe across a service restart — since
 * this poll already re-checks every SUBMITTED payment on every tick
 * (including ones a stream would have missed while disconnected), it's the
 * correctness-bearing mechanism either way. Layering a stream on top as a
 * pure latency optimization is a reasonable follow-up, not required for
 * this issue's acceptance criteria.
 */
@Injectable()
export class PaymentReconciliationService {
  private readonly logger = new Logger(PaymentReconciliationService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    private readonly stellarService: StellarService,
    private readonly paymentsGateway: PaymentsGateway,
    private readonly loyaltyPayoutService: LoyaltyPayoutService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async handleCron(): Promise<void> {
    const summary = await this.reconcile();
    if (summary.checked > 0 || summary.expired > 0) {
      this.logger.log(`Reconciliation pass: ${JSON.stringify(summary)}`);
    }
  }

  async reconcile(now: Date = new Date()): Promise<ReconciliationSummary> {
    const summary: ReconciliationSummary = {
      checked: 0,
      confirmed: 0,
      failed: 0,
      stillPending: 0,
      expired: 0,
    };

    const submitted = await this.paymentRepository.find({
      where: { status: PaymentStatus.SUBMITTED },
    });

    for (const payment of submitted) {
      summary.checked++;
      const resolved = await this.confirmOne(payment, now);
      switch (resolved.status) {
        case PaymentStatus.CONFIRMED:
          summary.confirmed++;
          break;
        case PaymentStatus.FAILED:
          summary.failed++;
          break;
        case PaymentStatus.EXPIRED:
          summary.expired++;
          break;
        default:
          summary.stillPending++;
      }
    }

    await this.expireStale(now, summary);

    return summary;
  }

  /**
   * The only place allowed to set CONFIRMED — always by independently
   * querying Horizon for the payment's own `stellarTxHash`, never assumed
   * from the earlier submit call (issue #314's central requirement).
   */
  private async confirmOne(payment: Payment, now: Date): Promise<Payment> {
    if (!payment.stellarTxHash) {
      // Nothing to verify yet — shouldn't normally happen for a SUBMITTED
      // payment, but never let a malformed row loop forever; expiry still
      // applies to it via expireStale.
      return payment;
    }

    try {
      const record = await this.stellarService.fetchTransaction(
        payment.stellarTxHash,
      );

      if (record.successful) {
        assertValidTransition(payment.status, PaymentStatus.CONFIRMED);
        payment.status = PaymentStatus.CONFIRMED;
        payment.confirmedAt = now;
      } else {
        assertValidTransition(payment.status, PaymentStatus.FAILED);
        payment.status = PaymentStatus.FAILED;
        payment.failureReason = 'SUBMISSION_FAILED';
      }

      const saved = await this.paymentRepository.save(payment);
      this.logger.log(
        `Payment ${saved.id} reconciled to ${saved.status} (tx ${payment.stellarTxHash})`,
      );
      await this.emitStatusChanged(saved);

      if (saved.status === PaymentStatus.CONFIRMED) {
        // Distinct, independently-retryable concerns from the payment
        // itself (issue #316 / ADR 0004) — a hiccup in either must never
        // roll back or block the payment's own CONFIRMED status, which is
        // already durably saved above.
        await this.markOrderPaid(saved.orderId);
        try {
          await this.loyaltyPayoutService.createForConfirmedPayment(saved);
        } catch (error) {
          this.logger.error(
            `Failed to create loyalty payout for payment ${saved.id} (order ${saved.orderId}): ` +
              (error instanceof Error ? error.message : String(error)),
          );
        }
      }

      return saved;
    } catch (error) {
      if (error instanceof NotFoundError) {
        // Horizon has no record of it yet — this is expected for a short
        // window after submission (propagation delay), not a failure.
        // Bounded by expireStale() once the transaction's own timebounds
        // pass without ever landing.
        return payment;
      }

      this.logger.warn(
        `Reconciliation check failed for payment ${payment.id}: ` +
          (error instanceof Error ? error.message : String(error)),
      );
      return payment;
    }
  }

  /**
   * Payments whose Stellar timebounds have passed without ever being
   * confirmed — including ones still PENDING (never even submitted) — are
   * marked EXPIRED rather than FAILED, so it's clear the customer was
   * never charged. A SUBMITTED payment is given one last direct check
   * first, in case it confirmed in the same instant its deadline passed.
   */
  private async expireStale(
    now: Date,
    summary: ReconciliationSummary,
  ): Promise<void> {
    const stale = await this.paymentRepository.find({
      where: [
        { status: PaymentStatus.PENDING, expiresAt: LessThan(now) },
        { status: PaymentStatus.SUBMITTED, expiresAt: LessThan(now) },
      ],
    });

    for (const payment of stale) {
      if (payment.status === PaymentStatus.SUBMITTED) {
        const resolved = await this.confirmOne(payment, now);
        if (resolved.status === PaymentStatus.CONFIRMED) {
          summary.confirmed++;
          continue;
        }
        if (resolved.status === PaymentStatus.FAILED) {
          summary.failed++;
          continue;
        }
        // Still SUBMITTED — Horizon has no record and never will in time.
      }

      assertValidTransition(payment.status, PaymentStatus.EXPIRED);
      payment.status = PaymentStatus.EXPIRED;
      const saved = await this.paymentRepository.save(payment);
      this.logger.warn(
        `Payment ${saved.id} expired without confirmation (timebounds passed)`,
      );
      await this.emitStatusChanged(saved);
      summary.expired++;
    }
  }

  /**
   * A confirmed payment flips its order from PENDING to CONFIRMED — "paid"
   * (issue #316: the order-marked-paid step of the settlement flow). Only
   * ever advances from PENDING: if staff already moved the order further
   * (PREPARING, etc.) or it was somehow already CONFIRMED, reconciliation
   * re-running this (idempotent by construction, since a Payment only
   * reaches CONFIRMED once — see payment-state-machine.ts) must never
   * clobber a status the kitchen workflow has since moved past.
   */
  private async markOrderPaid(orderId: string): Promise<void> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
    });
    if (!order || order.status !== OrderStatus.PENDING) return;

    order.status = OrderStatus.CONFIRMED;
    await this.orderRepository.save(order);
    this.logger.log(`Order ${orderId} marked paid (status -> CONFIRMED)`);
  }

  private async emitStatusChanged(payment: Payment): Promise<void> {
    const order = await this.orderRepository.findOne({
      where: { id: payment.orderId },
    });
    if (!order) return;

    this.paymentsGateway.emitPaymentStatusChanged(order.restaurantId, {
      paymentId: payment.id,
      orderId: payment.orderId,
      status: payment.status,
      stellarTxHash: payment.stellarTxHash,
      failureReason: payment.failureReason,
      updatedAt: new Date().toISOString(),
    });
  }
}
