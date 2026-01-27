import { OrderStatus } from 'src/common/enums/orderStatus.enun';
import { OrderType } from 'src/common/enums/orderType.enum';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';


@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  orderNumber: number;

  @Column()
  customerId: string;

  @Column()
  restaurantId: string;

  @Column({ type: 'enum', enum: OrderType })
  orderType: OrderType;

  @Column({ type: 'enum', enum: OrderStatus })
  status: OrderStatus;

  @Column('decimal', { precision: 10, scale: 2 })
  subtotal: number;

  @Column('decimal', { precision: 10, scale: 2 })
  taxAmount: number;

  @Column('decimal', { precision: 10, scale: 2 })
  serviceFee: number;

  @Column('decimal', { precision: 10, scale: 2 })
  deliveryFee: number;

  @Column('decimal', { precision: 10, scale: 2 })
  cryptoDiscount: number;

  @Column('decimal', { precision: 10, scale: 2 })
  total: number;

  @Column({ type: 'json', nullable: true })
  deliveryAddress?: any;

  @Column({ nullable: true })
  tableNumber?: string;

  @Column({ nullable: true })
  completedAt?: Date;

  @Column({ nullable: true })
  cancelledAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
