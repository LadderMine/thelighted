import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StellarService } from './stellar.service';

@Injectable()
export class ExchangeRateJobService implements OnModuleInit {
  private readonly logger = new Logger(ExchangeRateJobService.name);

  constructor(private readonly stellarService: StellarService) {}

  async onModuleInit() {
    // Initialize exchange rates when the module starts
    await this.updateExchangeRates();
  }

  @Cron(CronExpression.EVERY_30_SECONDS) // Run every 30 seconds
  async handleCron() {
    this.logger.debug('Running exchange rate update job');
    await this.updateExchangeRates();
  }

  private async updateExchangeRates() {
    try {
      const rates = await this.stellarService.getExchangeRates();
      this.logger.log(`Updated exchange rates - XLM: $${rates.xlmToUsd}, USDC: $${rates.usdcToUsd}`);
    } catch (error) {
      this.logger.error(`Failed to update exchange rates: ${error.message}`);
    }
  }
}