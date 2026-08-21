// backend/src/modules/payments/payments.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Order } from '../orders/order.entity';
import { Restaurant } from '../restaurant/restaurant.entity';
import { Payment, PaymentStatus } from './payment.entity';
import { StellarService } from './stellar.service';
import { SequenceAllocator } from './sequence-allocator.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { SubmitSignedPaymentDto } from './dto/submit-signed-payment.dto';
import { mapHorizonSubmissionError } from './errors/horizon-error-mapper';
import {
  IdempotencyConflictError,
  MalformedPaymentRequestError,
  RestaurantWalletNotConfiguredError,
  SequenceConflictError,
} from './errors/payment.errors';

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

    // Already-terminal payments are a no-op replay, not a resubmission —
    // the client may retry after a dropped HTTP response even though the
    // first submission already reached Horizon.
    if (
      payment.status === PaymentStatus.SUBMITTED ||
      payment.status === PaymentStatus.CONFIRMED
    ) {
      return {
        paymentId: payment.id,
        status: payment.status,
        stellarTxHash: payment.stellarTxHash,
      };
    }

    try {
      const response = await this.stellarService.submitTransaction(
        dto.signedTransactionXdr,
      );

      payment.status = PaymentStatus.CONFIRMED;
      payment.stellarTxHash = response.hash;
      payment.horizonEnvelopeXdr = dto.signedTransactionXdr;
      payment.confirmedAt = new Date();
      await this.paymentRepository.save(payment);

      return {
        paymentId: payment.id,
        status: payment.status,
        stellarTxHash: payment.stellarTxHash,
      };
    } catch (error) {
      const mapped = mapHorizonSubmissionError(error);

      if (mapped instanceof SequenceConflictError) {
        this.sequenceAllocator.invalidate(payment.sourceAccount);
      }

      payment.status = PaymentStatus.FAILED;
      payment.failureReason = mapped.code;
      await this.paymentRepository.save(payment);

      throw mapped;
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      (error as unknown as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION
    );
  }
}
