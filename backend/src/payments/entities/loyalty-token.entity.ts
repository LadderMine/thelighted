import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('loyalty_tokens')
export class LoyaltyToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'restaurantId' })
  restaurantId: string;

  @Column({ type: 'varchar', unique: true, nullable: false })
  @Index()
  tokenCode: string;

  @Column({ type: 'varchar', name: 'assetCode' })
  assetCode: string;

  @Column({ type: 'varchar', name: 'issuerAddress' })
  issuerAddress: string;

  @Column({ type: 'bigint', name: 'totalSupply' })
  totalSupply: bigint;

  @Column({ type: 'bigint', name: 'circulatingSupply', default: 0 })
  circulatingSupply: bigint;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'tokensPerDollar' })
  tokensPerDollar: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'redemptionValue' })
  redemptionValue: number;

  @Column({ type: 'int', name: 'expirationDays', nullable: true })
  expirationDays: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt' })
  updatedAt: Date;
}