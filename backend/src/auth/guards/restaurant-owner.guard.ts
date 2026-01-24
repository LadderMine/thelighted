import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RestaurantOwner } from '../entities/restaurant-owner.entity';
import { UserRole } from '../entities/user.entity';

@Injectable()
export class RestaurantOwnerGuard implements CanActivate {
  constructor(
    @InjectRepository(RestaurantOwner)
    private restaurantOwnerRepository: Repository<RestaurantOwner>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Admin users can access all restaurants
    if (user.role === UserRole.ADMIN) {
      return true;
    }

    // Extract restaurantId from params, query, or body
    const restaurantId =
      request.params.restaurantId ||
      request.query.restaurantId ||
      request.body.restaurantId;

    if (!restaurantId) {
      throw new ForbiddenException('Restaurant ID not provided');
    }

    // Check if user has relationship with this restaurant
    const relationship = await this.restaurantOwnerRepository.findOne({
      where: {
        userId: user.id,
        restaurantId: restaurantId,
      },
    });

    if (!relationship) {
      throw new ForbiddenException('You do not have access to this restaurant');
    }

    // Attach restaurant relationship to request for further use
    request.restaurantRole = relationship.role;

    return true;
  }
}
