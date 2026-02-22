// backend/src/modules/restaurant/restaurant.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { AdminUser } from '../auth/admin-user.entity';
import { MenuItem } from '../menu/menu-item.entity';
import { AnalyticsEvent } from '../analytics/analytics-event.entity';
import { ContactSubmission } from '../contact/contact-submission.entity';
import { GalleryImage } from '../gallery/gallery-image.entity';
import { InstagramPost } from '../instagram/instagram-post.entity';
import { AuditLog } from '../admin/audit-log.entity';

@Entity('restaurants')
export class Restaurant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  name: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  slug: string; // URL-friendly identifier

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string;

  @Column({ type: 'text', nullable: true })
  address: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  whatsappNumber: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'jsonb', nullable: true })
  settings: Record<string, any>; // Store restaurant-specific settings

  @OneToMany(() => AdminUser, (user) => user.restaurant)
  users: AdminUser[];

  @OneToMany(() => MenuItem, (item) => item.restaurant)
  menuItems: MenuItem[];

  @OneToMany(() => AnalyticsEvent, (item) => item.restaurant)
  analyticsEvents: AnalyticsEvent[];

  @OneToMany(() => ContactSubmission, (item) => item.restaurant)
  contactSubmissions: ContactSubmission[];

  @OneToMany(() => InstagramPost, (item) => item.restaurant)
  instagramPosts: InstagramPost[];

  @OneToMany(() => GalleryImage, (item) => item.restaurant)
  galleryImages: GalleryImage[];

  @OneToMany(() => AuditLog, (item) => item.restaurant)
  auditLogs: AuditLog[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
