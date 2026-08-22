// backend/src/modules/payments/payments.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Order } from '../orders/order.entity';
import { Restaurant } from '../restaurant/restaurant.entity';
import { Payment, PaymentStatus } from './payment.entity';
import { StellarService, TRANSACTION_TIMEOUT_SECONDS } from './stellar.service';
import { SequenceAllocator } from './sequence-allocator.service';
import { PaymentsGateway } from './payments.gateway';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { SubmitSignedPaymentDto } from './dto/submit-signed-payment.dto';
import {
  isDefinitiveHorizonRejection,
  mapHorizonSubmissionError,
} from './errors/horizon-error-mapper';
import {
  IdempotencyConflictError,
  MalformedPaymentRequestError,
  RestaurantWalletNotConfiguredError,
  SequenceConflictError,
} from './errors/payment.errors';
import { assertValidTransition } from './payment-state-machine';

// Postgres unique_violation — see https://www.postgresql.org/docs/current/errcodes-appendix.html
const POSTGRES_UNIQUE_VIOLATION = '23505';

export interface InitiatePaymentResult {
  paymentId: string;
  status: PaymentStatus;
  unsignedTransactionXdr: string;
}

export interface SubmitSignedPaymentResult {
  paymentId: string;
  status: PaymentStatus;
  stellarTxHash: string | null;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(Restaurant)
    private readonly restaurantRepository: Repository<Restaurant>,
    private readonly stellarService: StellarService,
    private readonly sequenceAllocator: SequenceAllocator,
    private readonly paymentsGateway: PaymentsGateway,
  ) {}

  async initiate(dto: InitiatePaymentDto): Promise<InitiatePaymentResult> {
    const existing = await this.paymentRepository.findOne({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (existing) {
      return this.replayInitiate(existing, dto);
    }

    if (dto.assetCode !== 'XLM' && !dto.assetIssuer) {
      throw new MalformedPaymentRequestError({
        reason: 'assetIssuer is required for non-XLM assets',
      });
    }

    const order = await this.orderRepository.findOne({
      where: { id: dto.orderId },
    });
    if (!order) {
      throw new MalformedPaymentRequestError({ reason: 'unknown orderId' });
    }

    const restaurant = await this.restaurantRepository.findOne({
      where: { id: order.restaurantId },
    });
    if (!restaurant?.stellarWalletAddress) {
      throw new RestaurantWalletNotConfiguredError();
    }

    const sequence = await this.sequenceAllocator.allocate(dto.sourceAccount);
    const unsignedTransactionXdr =
      await this.stellarService.buildPaymentTransaction({
        sourceAccount: dto.sourceAccount,
        destinationAccount: restaurant.stellarWalletAddress,
        assetCode: dto.assetCode,
        assetIssuer: dto.assetIssuer,
        amount: dto.amount,
        memo: order.orderNumber,
        sequenceOverride: sequence,
      });

    const payment = await this.createPayment(
      dto,
      restaurant,
      unsignedTransactionXdr,
    );

    return {
      paymentId: payment.id,
      status: payment.status,
      unsignedTransactionXdr,
    };
  }

  // Handles the race where two concurrent requests for the same
  // idempotencyKey both miss the initial findOne and both try to build/save
  // — the DB's unique constraint on idempotencyKey (see payment.entity.ts)
  // is the actual source of truth; this just turns that constraint
  // violation into the same replay response a sequential caller would get.
  private async createPayment(
    dto: InitiatePaymentDto,
    restaurant: Restaurant,
    unsignedTransactionXdr: string,
  ): Promise<Payment> {
    const payment = this.paymentRepository.create({
      orderId: dto.orderId,
      idempotencyKey: dto.idempotencyKey,
      sourceAccount: dto.sourceAccount,
      destinationAccount: restaurant.stellarWalletAddress as string,
      asset: dto.assetCode,
      amount: Number(dto.amount),
      status: PaymentStatus.PENDING,
      horizonEnvelopeXdr: unsignedTransactionXdr,
      expiresAt: new Date(Date.now() + TRANSACTION_TIMEOUT_SECONDS * 1000),
    });

    try {
      return await this.paymentRepository.save(payment);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        const raced = await this.paymentRepository.findOne({
          where: { idempotencyKey: dto.idempotencyKey },
        });
        if (raced) {
          return raced;
        }
      }
      throw error;
    }
  }

  private replayInitiate(
    existing: Payment,
    dto: InitiatePaymentDto,
  ): InitiatePaymentResult {
    if (existing.orderId !== dto.orderId) {
      throw new IdempotencyConflictError(
        'This idempotency key was already used for a different order',
      );
    }

    return {
      paymentId: existing.id,
      status: existing.status,
      unsignedTransactionXdr: existing.horizonEnvelopeXdr ?? '',
    };
  }

  /**
   * `CONFIRMED` is never set here — only PaymentReconciliationService may
   * set it, and only after independently verifying the transaction against
   * Horizon by hash (issue #314). This method's job is just: attempt
   * submission, and record enough (the locally-computed hash) that the
   * outcome can always be resolved later, even if the submit call itself
   * errors ambiguously.
   */
  async submitSigned(
    paymentId: string,
    orderId: string,
    dto: SubmitSignedPaymentDto,
  ): Promise<SubmitSignedPaymentResult> {
    const payment = await this.paymentRepository.findOne({
      where: { id: paymentId, orderId },
    });
    if (!payment) {
      throw new MalformedPaymentRequestError({ reason: 'unknown paymentId' });
    }

    // Already-terminal or already-submitted payments are a no-op replay,
    // not a resubmission — the client may retry after a dropped HTTP
    // response even though the first submission already reached Horizon.
    if (payment.status !== PaymentStatus.PENDING) {
      return {
        paymentId: payment.id,
        status: payment.status,
        stellarTxHash: payment.stellarTxHash,
      };
    }

    // Computed locally, before ever calling Horizon — if the submit call
    // below throws ambiguously (timeout, dropped connection), we still
    // know which hash to independently verify later instead of having no
    // way to look the transaction up at all.
    const stellarTxHash = this.stellarService.computeTransactionHash(
      dto.signedTransactionXdr,
    );
    assertValidTransition(payment.status, PaymentStatus.SUBMITTED);
    payment.status = PaymentStatus.SUBMITTED;
    payment.stellarTxHash = stellarTxHash;
    payment.horizonEnvelopeXdr = dto.signedTransactionXdr;
    await this.paymentRepository.save(payment);
    await this.emitStatusChanged(payment);

    try {
      await this.stellarService.submitTransaction(dto.signedTransactionXdr);
      // A clean response here means Horizon accepted it — but per #314,
      // `confirmed` is only ever set by independent by-hash verification,
      // which PaymentReconciliationService performs on its own schedule.
      return {
        paymentId: payment.id,
        status: payment.status,
        stellarTxHash: payment.stellarTxHash,
      };
    } catch (error) {
      if (!isDefinitiveHorizonRejection(error)) {
        // Ambiguous: we don't know whether Horizon actually applied it.
        // Leave the payment SUBMITTED — reconciliation resolves it from
        // here, by hash, rather than risk marking a possibly-successful
        // payment FAILED.
        this.logger.warn(
          `Ambiguous submit error for payment ${payment.id} (hash ${stellarTxHash}); ` +
            'leaving SUBMITTED for reconciliation to resolve: ' +
            (error instanceof Error ? error.message : String(error)),
        );
        return {
          paymentId: payment.id,
          status: payment.status,
          stellarTxHash: payment.stellarTxHash,
        };
      }

      const mapped = mapHorizonSubmissionError(error);

      if (mapped instanceof SequenceConflictError) {
        this.sequenceAllocator.invalidate(payment.sourceAccount);
      }

      assertValidTransition(payment.status, PaymentStatus.FAILED);
      payment.status = PaymentStatus.FAILED;
      payment.failureReason = mapped.code;
      await this.paymentRepository.save(payment);
      await this.emitStatusChanged(payment);

      throw mapped;
    }
  }

  async findOne(paymentId: string, orderId: string): Promise<Payment> {
    const payment = await this.paymentRepository.findOne({
      where: { id: paymentId, orderId },
    });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    return payment;
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

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      (error as unknown as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION
    );
  }
}
