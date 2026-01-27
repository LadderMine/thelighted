import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('loyalty_balances')
export class LoyaltyBalance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'userId' })
  userId: string;

  @Column({ type: 'uuid', name: 'tokenId' })
  tokenId: string;

  @Column({ type: 'bigint', default: 0 })
  balance: bigint;

  @Column({ type: 'bigint', name: 'lifetimeEarned', default: 0 })
  lifetimeEarned: bigint;

  @Column({ type: 'bigint', name: 'lifetimeRedeemed', default: 0 })
  lifetimeRedeemed: bigint;

  @Column({ type: 'timestamp', nullable: true, name: 'lastEarnedAt' })
  lastEarnedAt: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'lastRedeemedAt' })
  lastRedeemedAt: Date;

  @UpdateDateColumn({ name: 'updatedAt' })
  updatedAt: Date;
}