import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { TypeOrmModule } from '@nestjs/typeorm/dist/typeorm.module';
import { BullModule } from '@nestjs/bull';
import { Order } from './entities/order.entity';
import { OrderStatusHistory } from './entities/order-status-history.entity';
import { PricingService } from './services/pricing.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order,
      OrderStatusHistory,
    ]),
    BullModule.registerQueue({ name: 'orders' }),
  ],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    PricingService,
  ],
  exports: [OrdersService],
})
export class OrdersModule {}

