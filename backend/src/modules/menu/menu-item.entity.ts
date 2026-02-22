// backend/src/modules/menu/menu-item.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { Restaurant } from '../restaurant/restaurant.entity';

export enum MenuCategory {
  APPETIZERS_SMALL_CHOPS = 'appetizers_small_chops',
  SOUPS = 'soups',
  SWALLOW = 'swallow',
  SALADS = 'salads',
  RICE_DISHES = 'rice_dishes',
  PROTEINS = 'proteins',
  STEWS_SAUCES = 'stews_sauces',
  BEAN_DISHES = 'bean_dishes',
  YAM_DISHES = 'yam_dishes',
  GRILLS_BARBECUE = 'grills_barbecue',
  SPECIAL_DELICACIES = 'special_delicacies',
  DRINKS = 'drinks',
  DESSERTS = 'desserts',
  PASTA = 'pasta',
}

export enum MoodTag {
  SPICY = 'spicy',
  COMFORT = 'comfort',
  LIGHT = 'light',
  ADVENTUROUS = 'adventurous',
  TRADITIONAL = 'traditional',
  HEALTHY = 'healthy',
  INDULGENT = 'indulgent',
  FESTIVE = 'festive',
  HEARTY = 'hearty',
  QUICK_BITE = 'quick_bite',
  STREET_FOOD = 'street_food',
  RICH = 'rich',
  REFRESHING = 'refreshing',
}

export enum TimeOfDay {
  MORNING = 'morning',
  AFTERNOON = 'afternoon',
  EVENING = 'evening',
  NIGHT = 'night',
}

@Entity('menu_items')
export class MenuItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @Column({
    type: 'enum',
    enum: MenuCategory,
  })
  category: MenuCategory;

  @Column({ type: 'varchar', length: 500 })
  image: string;

  @Column({ type: 'boolean', default: true })
  isAvailable: boolean;

  @Column({ type: 'int', nullable: true })
  preparationTime: number;

  @Column({ type: 'int', default: 0 })
  clickCount: number;

  @Column({ type: 'simple-array', nullable: true })
  moodTags: string[];

  @Column({ type: 'simple-array', nullable: true })
  timeOfDay: string[];

  @Column({ type: 'uuid' })
  restaurantId: string;

  @ManyToOne(() => Restaurant, (restaurant) => restaurant.menuItems, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'restaurantId' })
  restaurant: Restaurant;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
