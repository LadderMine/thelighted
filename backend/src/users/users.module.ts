import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './controllers/users.controller';
import { UsersService } from './services/users.service';
import { User } from '../auth/entities/user.entity';
import { RestaurantOwner } from '../auth/entities/restaurant-owner.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, RestaurantOwner])],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
