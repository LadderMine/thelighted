// frontend/src/lib/types/user.ts
export enum AdminRole {
  SUPER_ADMIN = "super_admin",
  ADMIN = "admin",
  MANAGER = "manager",
  STAFF = "staff",
}

export interface AdminUser {
  id: string;
  username: string;
  email: string;
  role: AdminRole;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
}
