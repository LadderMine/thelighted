// backend/src/modules/payments/payment.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Order } from '../orders/order.entity';

export enum PaymentStatus {
  PENDING = 'pending',
  SUBMITTED = 'submitted',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
  EXPIRED = 'expired',
}

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  // Last line of defense against duplicate charges — enforced at the DB
  // constraint level, not just in application logic (issue #312 edge case).
  @Column({ type: 'varchar', length: 255, unique: true })
  idempotencyKey: string;

  @Column({ type: 'varchar', length: 56 })
  sourceAccount: string;

  @Column({ type: 'varchar', length: 56 })
  destinationAccount: string;

  @Column({ type: 'varchar', length: 12 })
  asset: string;

  @Column({ type: 'decimal', precision: 20, scale: 7 })
  amount: number;

  // Portion of `amount` routed to the platform, as a second payment
  // operation in the SAME diner-signed transaction as the restaurant's
  // share (issue #316 / ADR 0004) — atomic with the primary payment, never
  // a separately-failable step. 0 when no platform fee is configured.
  @Column({ type: 'decimal', precision: 20, scale: 7, default: 0 })
  platformFeeAmount: number;

  // The platform fee address this payment actually used, recorded even
  // though it's also in config — config can change after the fact, but a
  // settled payment's real destination must stay traceable (issue #316
  // acceptance criteria: "all traceable to one order"). Null when
  // platformFeeAmount is 0 (no fee collected on this payment).
  @Column({ type: 'varchar', length: 56, nullable: true })
  platformFeeDestination: string | null;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  status: PaymentStatus;

  // Null until the transaction has actually been submitted to Horizon.
  @Column({ type: 'varchar', length: 64, nullable: true })
  stellarTxHash: string | null;

  @Column({ type: 'text', nullable: true })
  horizonEnvelopeXdr: string | null;

  @Column({ type: 'timestamp', nullable: true })
  confirmedAt: Date | null;

  // Mirrors the built transaction's own Stellar timebounds (issue #314) —
  // once this passes without an independently-verified confirmation, the
  // reconciliation job marks the payment EXPIRED rather than polling
  // forever. Set at PENDING-creation time in PaymentsService.initiate().
  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  // Populated when status transitions to FAILED — a typed PaymentErrorCode
  // (see errors/payment.errors.ts), not a raw Horizon/stack-trace dump, so
  // it's safe to surface back to the diner-facing client.
  @Column({ type: 'varchar', length: 64, nullable: true })
  failureReason: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
