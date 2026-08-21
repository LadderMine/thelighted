// backend/src/modules/orders/order.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Restaurant } from '../restaurant/restaurant.entity';

export enum OrderStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  PREPARING = 'preparing',
  READY = 'ready',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

// Line items are stored as jsonb rather than a child table for now — the
// real order-creation flow (with a validated cart/menu-item linkage) is a
// later issue in this batch; this shape is a placeholder good enough to
// persist what the current notification-only endpoints already collect.
export interface OrderLineItem {
  name: string;
  quantity: number;
  price: number;
}

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  orderNumber: string;

  @Column({ type: 'uuid' })
  restaurantId: string;

  @ManyToOne(() => Restaurant, (restaurant) => restaurant.orders, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'restaurantId' })
  restaurant: Restaurant;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  items: OrderLineItem[];

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  total: number;

  // Settlement asset code (e.g. XLM, USDC) — matches the asset the diner
  // pays with via StellarCheckout, not a fiat currency.
  @Column({ type: 'varchar', length: 10, default: 'XLM' })
  currency: string;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
