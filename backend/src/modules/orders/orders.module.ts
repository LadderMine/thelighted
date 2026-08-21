// backend/src/modules/orders/orders.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Order } from './order.entity';
import { OrdersController } from './orders.controller';
import { OrdersGateway } from './orders.gateway';
import { OrdersService } from './orders.service';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([Order])],
  controllers: [OrdersController],
  providers: [OrdersGateway, OrdersService],
  exports: [OrdersGateway, OrdersService],
})
export class OrdersModule {}
