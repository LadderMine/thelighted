// backend/src/modules/payments/loyalty-payout.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Payment } from './payment.entity';

export enum LoyaltyPayoutStatus {
  PENDING = 'pending',
  SUBMITTED = 'submitted',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
}

// One loyalty payout per confirmed payment — a platform-signed transaction
// distinct from the (diner-signed) primary payment, so it needs its own
// idempotent, independently-retryable lifecycle (issue #316 / ADR 0004).
@Entity('loyalty_payouts')
export class LoyaltyPayout {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Last line of defense against double-issuing loyalty for the same
  // payment — enforced at the DB constraint level, mirroring
  // Payment.idempotencyKey's pattern, not just checked in application code.
  @Column({ type: 'uuid', unique: true })
  paymentId: string;

  @ManyToOne(() => Payment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'paymentId' })
  payment: Payment;

  @Column({ type: 'uuid' })
  orderId: string;

  // The diner's own wallet — same account that signed the primary payment
  // (Payment.sourceAccount). The platform sends TO this account; the diner
  // never signs anything for their own payout.
  @Column({ type: 'varchar', length: 56 })
  destinationAccount: string;

  @Column({ type: 'varchar', length: 12 })
  assetCode: string;

  @Column({ type: 'varchar', length: 56 })
  assetIssuer: string;

  @Column({ type: 'decimal', precision: 20, scale: 7 })
  amount: number;

  @Column({
    type: 'enum',
    enum: LoyaltyPayoutStatus,
    default: LoyaltyPayoutStatus.PENDING,
  })
  status: LoyaltyPayoutStatus;

  @Column({ type: 'varchar', length: 64, nullable: true })
  stellarTxHash: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  failureReason: string | null;

  // How many submission attempts so far — drives the retry job's backoff,
  // so a payout stuck for a real reason (e.g. diner has no trustline for
  // the loyalty asset) doesn't hammer Horizon every tick.
  @Column({ type: 'int', default: 0 })
  attemptCount: number;

  @Column({ type: 'timestamp', nullable: true })
  lastAttemptAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  confirmedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
