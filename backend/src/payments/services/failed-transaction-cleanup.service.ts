import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { StellarTransaction, TransactionStatus } from '../entities/stellar-transaction.entity';

@Injectable()
export class FailedTransactionCleanupService implements OnModuleInit {
  private readonly logger = new Logger(FailedTransactionCleanupService.name);

  constructor(
    @InjectRepository(StellarTransaction)
    private readonly transactionRepository: Repository<StellarTransaction>,
  ) {}

  async onModuleInit() {
    // Initialize cleanup when the module starts
    await this.cleanupOldFailedTransactions();
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT) // Run daily at midnight
  async handleCron() {
    this.logger.debug('Running failed transaction cleanup job');
    await this.cleanupOldFailedTransactions();
  }

  private async cleanupOldFailedTransactions() {
    try {
      // Find failed transactions older than 30 days
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30); // 30 days ago

      const oldFailedTransactions = await this.transactionRepository.find({
        where: {
          status: TransactionStatus.FAILED,
          createdAt: LessThan(cutoffDate), // Older than cutoff date
        },
      });

      if (oldFailedTransactions.length === 0) {
        this.logger.debug('No old failed transactions to clean up');
        return;
      }

      this.logger.log(`Cleaning up ${oldFailedTransactions.length} old failed transactions`);

      // In a real implementation, you might archive these instead of deleting
      // For now, we'll just log them
      for (const transaction of oldFailedTransactions) {
        this.logger.log(`Would clean up transaction ${transaction.id} from ${transaction.createdAt}`);
      }

      // Uncomment the following lines to actually delete the old failed transactions
      // await this.transactionRepository.remove(oldFailedTransactions);
    } catch (error) {
      this.logger.error(`Failed to clean up old failed transactions: ${error.message}`);
    }
  }
}