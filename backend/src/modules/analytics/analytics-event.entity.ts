// backend/src/modules/analytics/analytics-event.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { MenuItem } from '../menu/menu-item.entity';
import { Restaurant } from '../restaurant/restaurant.entity';

export enum EventType {
  PAGEVIEW = 'pageview',
  MENU_VIEW = 'menu_view',
  ORDER_CLICK = 'order_click',
}

@Entity('analytics_events')
export class AnalyticsEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: EventType,
  })
  eventType: EventType;

  @Column({ type: 'uuid', nullable: true })
  itemId: string;

  @ManyToOne(() => MenuItem, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'itemId' })
  item: MenuItem;

  @Column({ type: 'varchar', length: 500, nullable: true })
  page: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @Column({ type: 'uuid' })
  restaurantId: string;

  @ManyToOne(() => Restaurant, (restaurant) => restaurant.analyticsEvents, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'restaurantId' })
  restaurant: Restaurant;

  @CreateDateColumn()
  timestamp: Date;
}
