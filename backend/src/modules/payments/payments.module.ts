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
import { PaymentsGateway } from './payments.gateway';
import { PaymentReconciliationService } from './payment-reconciliation.service';
import { OrdersModule } from '../orders/orders.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Order, Restaurant]),
    OrdersModule,
    // PaymentsGateway needs JwtService directly — OrdersModule imports
    // AuthModule but doesn't re-export it, so it must be imported here too.
    AuthModule,
  ],
  controllers: [PaymentsController],
  providers: [
    StellarService,
    SequenceAllocator,
    PaymentsService,
    PaymentsGateway,
    PaymentReconciliationService,
  ],
  exports: [StellarService],
})
export class PaymentsModule {}
