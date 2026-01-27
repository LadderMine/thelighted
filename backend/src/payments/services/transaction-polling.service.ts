import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StellarTransaction, TransactionStatus } from '../entities/stellar-transaction.entity';
import { StellarService } from './stellar.service';

@Injectable()
export class TransactionPollingService implements OnModuleInit {
  private readonly logger = new Logger(TransactionPollingService.name);

  constructor(
    private readonly stellarService: StellarService,
    @InjectRepository(StellarTransaction)
    private readonly transactionRepository: Repository<StellarTransaction>,
  ) {}

  async onModuleInit() {
    // Initialize polling when the module starts
    await this.checkPendingTransactions();
  }

  @Cron(CronExpression.EVERY_MINUTE) // Run every minute
  async handleCron() {
    this.logger.debug('Running pending transaction check');
    await this.checkPendingTransactions();
  }

  private async checkPendingTransactions() {
    try {
      // Find all transactions that are still pending
      const pendingTransactions = await this.transactionRepository.find({
        where: { status: TransactionStatus.PENDING },
      });

      if (pendingTransactions.length === 0) {
        this.logger.debug('No pending transactions to check');
        return;
      }

      this.logger.log(`Checking ${pendingTransactions.length} pending transactions`);

      for (const transaction of pendingTransactions) {
        try {
          // Skip if transaction doesn't have a hash yet (just initiated)
          if (!transaction.transactionHash) {
            continue;
          }

          // Attempt to confirm the transaction
          await this.stellarService.confirmPayment({
            transactionHash: transaction.transactionHash,
            orderId: transaction.orderId,
          });
        } catch (error) {
          this.logger.error(
            `Error confirming transaction ${transaction.id}: ${error.message}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(`Failed to check pending transactions: ${error.message}`);
    }
  }
}