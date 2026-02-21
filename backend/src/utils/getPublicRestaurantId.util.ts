// backend/src/utils/getPublicRestaurant.util.ts
import { BadRequestException } from '@nestjs/common';

// Helper method to get restaurantId from public requests
export function getPublicRestaurantId(req: any): string {
  const restaurantId = req.query.restaurantId;
  if (!restaurantId) {
    throw new BadRequestException('Restaurant ID is required');
  }
  return restaurantId;
}
