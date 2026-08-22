// backend/src/modules/payments/payments.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from './payment.entity';
import { Order } from '../orders/order.entity';
import { Restaurant } from '../restaurant/restaurant.entity';
import { StellarService } from './stellar.service';
import { SequenceAllocator } from './sequence-allocator.service';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Order, Restaurant]),
    OrdersModule,
  ],
  controllers: [PaymentsController],
  providers: [StellarService, SequenceAllocator, PaymentsService],
  exports: [StellarService],
})
export class PaymentsModule {}
