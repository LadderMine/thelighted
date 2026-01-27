import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StellarService } from './stellar.service';
import { StellarTransaction, TransactionStatus } from '../entities/stellar-transaction.entity';
import { LoyaltyToken } from '../entities/loyalty-token.entity';

@Injectable()
export class TokenDistributionService implements OnModuleInit {
  private readonly logger = new Logger(TokenDistributionService.name);

  constructor(
    private readonly stellarService: StellarService,
    @InjectRepository(StellarTransaction)
    private readonly transactionRepository: Repository<StellarTransaction>,
    @InjectRepository(LoyaltyToken)
    private readonly loyaltyTokenRepository: Repository<LoyaltyToken>,
  ) {}

  async onModuleInit() {
    // Initialize token distribution when the module starts
    await this.processPendingTokenDistributions();
  }

  @Cron(CronExpression.EVERY_30_SECONDS) // Run every 30 seconds
  async handleCron() {
    this.logger.debug('Running token distribution job');
    await this.processPendingTokenDistributions();
  }

  private async processPendingTokenDistributions() {
    try {
      // Find all confirmed transactions that haven't had tokens distributed yet
      // In a real implementation, you might track this with a separate flag or table
      const confirmedTransactions = await this.transactionRepository.find({
        where: { 
          status: TransactionStatus.CONFIRMED,
        },
        take: 10, // Limit to 10 at a time to prevent overload
      });

      if (confirmedTransactions.length === 0) {
        this.logger.debug('No confirmed transactions needing token distribution');
        return;
      }

      this.logger.log(`Processing token distribution for ${confirmedTransactions.length} transactions`);

      for (const transaction of confirmedTransactions) {
        try {
          // Attempt to issue loyalty tokens for this transaction
          // This will be a no-op if tokens were already issued
          await this.stellarService['issueLoyaltyTokensOnPayment'](transaction);
        } catch (error) {
          this.logger.error(
            `Error distributing tokens for transaction ${transaction.id}: ${error.message}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(`Failed to process token distributions: ${error.message}`);
    }
  }
}