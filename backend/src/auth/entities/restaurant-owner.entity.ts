import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum RestaurantRole {
  OWNER = 'owner',
  MANAGER = 'manager',
  STAFF = 'staff',
}

@Entity('restaurant_owners')
@Index(['userId', 'restaurantId'], { unique: true })
export class RestaurantOwner {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column('uuid')
  restaurantId: string;

  @Column({
    type: 'enum',
    enum: RestaurantRole,
    default: RestaurantRole.OWNER,
  })
  role: RestaurantRole;

  @CreateDateColumn()
  createdAt: Date;
}
