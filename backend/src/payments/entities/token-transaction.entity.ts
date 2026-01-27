import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

export enum TokenType {
  EARNED = 'EARNED',
  REDEEMED = 'REDEEMED',
  TRANSFERRED = 'TRANSFERRED'
}

@Entity('token_transactions')
export class TokenTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'tokenId' })
  tokenId: string;

  @Column({ type: 'uuid', name: 'userId' })
  userId: string;

  @Column({ type: 'varchar', name: 'transactionHash' })
  transactionHash: string;

  @Column({ type: 'bigint' })
  amount: bigint;

  @Column({
    type: 'enum',
    enum: TokenType,
    name: 'type'
  })
  type: TokenType;

  @Column({ type: 'uuid', name: 'orderId', nullable: true })
  orderId: string;

  @Column({ type: 'text' })
  description: string;

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;
}