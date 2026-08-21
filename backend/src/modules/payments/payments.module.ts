// backend/src/modules/payments/payments.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from './payment.entity';
import { StellarService } from './stellar.service';

// No HTTP endpoints yet — this issue only establishes the persisted
// schema and the Stellar service scaffolding. Payment initiation
// endpoints and business logic land in the next issue of this batch.
@Module({
  imports: [TypeOrmModule.forFeature([Payment])],
  providers: [StellarService],
  exports: [StellarService],
})
export class PaymentsModule {}
