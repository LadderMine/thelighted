// backend/src/modules/orders/orders.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Order } from './order.entity';
import { OrdersController } from './orders.controller';
import { OrdersGateway } from './orders.gateway';
import { OrdersService } from './orders.service';
import { CheckoutTokenService } from './checkout-token.service';
import { DinerCheckoutGuard } from './guards/diner-checkout.guard';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([Order])],
  controllers: [OrdersController],
  providers: [
    OrdersGateway,
    OrdersService,
    CheckoutTokenService,
    DinerCheckoutGuard,
  ],
  exports: [
    OrdersGateway,
    OrdersService,
    CheckoutTokenService,
    DinerCheckoutGuard,
  ],
})
export class OrdersModule {}
