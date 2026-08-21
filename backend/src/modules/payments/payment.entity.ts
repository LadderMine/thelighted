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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
