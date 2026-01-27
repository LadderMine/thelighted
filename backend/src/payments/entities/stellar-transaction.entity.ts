import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum TransactionStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED'
}

export enum TransactionType {
  PAYMENT = 'PAYMENT',
  TOKEN_ISSUANCE = 'TOKEN_ISSUANCE',
  REFUND = 'REFUND'
}

export enum AssetType {
  XLM = 'XLM',
  USDC = 'USDC'
}

@Entity('stellar_transactions')
export class StellarTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'orderId', nullable: true })
  orderId: string;

  @Column({ type: 'varchar', unique: true, nullable: false })
  @Index()
  transactionHash: string;

  @Column({ type: 'varchar', name: 'fromAddress' })
  fromAddress: string;

  @Column({ type: 'varchar', name: 'toAddress' })
  toAddress: string;

  @Column({
    type: 'enum',
    enum: AssetType,
    name: 'asset'
  })
  asset: AssetType;

  @Column({ type: 'decimal', precision: 20, scale: 7 })
  amount: number;

  @Column({ type: 'decimal', precision: 20, scale: 2, name: 'amountInUSD' })
  amountInUSD: number;

  @Column({ type: 'decimal', precision: 20, scale: 7 })
  fee: number;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.PENDING
  })
  status: TransactionStatus;

  @Column({ type: 'bigint', name: 'blockNumber', nullable: true })
  blockNumber: bigint;

  @Column({ type: 'int', nullable: true })
  ledger: number;

  @Column({ type: 'text', nullable: true })
  memo: string;

  @Column({
    type: 'enum',
    enum: TransactionType,
    name: 'transactionType'
  })
  transactionType: TransactionType;

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'confirmedAt' })
  confirmedAt: Date;
}