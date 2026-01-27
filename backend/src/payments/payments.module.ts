import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { StellarController } from './controllers/stellar.controller';
import { StellarService } from './services/stellar.service';
import { ExchangeRateJobService } from './services/exchange-rate-job.service';
import { TransactionPollingService } from './services/transaction-polling.service';
import { TokenDistributionService } from './services/token-distribution.service';
import { FailedTransactionCleanupService } from './services/failed-transaction-cleanup.service';
import { StellarTransaction } from './entities/stellar-transaction.entity';
import { StellarWallet } from './entities/stellar-wallet.entity';
import { LoyaltyToken } from './entities/loyalty-token.entity';
import { LoyaltyBalance } from './entities/loyalty-balance.entity';
import { TokenTransaction } from './entities/token-transaction.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StellarTransaction,
      StellarWallet,
      LoyaltyToken,
      LoyaltyBalance,
      TokenTransaction,
    ]),
    ScheduleModule.forRoot(), // Enable scheduling features
  ],
  controllers: [StellarController],
  providers: [StellarService, ExchangeRateJobService, TransactionPollingService, TokenDistributionService, FailedTransactionCleanupService],
  exports: [StellarService],
})
export class PaymentsModule {}