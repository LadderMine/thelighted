import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Unique, Index, ManyToOne, JoinColumn } from 'typeorm';

@Entity('stellar_wallets')
@Unique(['publicKey'])
export class StellarWallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'userId' })
  userId: string;

  @Column({ type: 'varchar', unique: true, nullable: false })
  @Index()
  publicKey: string;

  @Column({
    type: 'enum',
    enum: ['FREIGHTER', 'ALBEDO', 'LOBSTR'],
    name: 'walletType'
  })
  walletType: string;

  @Column({ type: 'boolean', default: false })
  isVerified: boolean;

  @Column({ type: 'timestamp', nullable: true, name: 'lastVerifiedAt' })
  lastVerifiedAt: Date;

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt' })
  updatedAt: Date;
}