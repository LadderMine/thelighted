import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StellarService } from './services/stellar.service';
import { StellarTransaction } from './entities/stellar-transaction.entity';
import { StellarWallet } from './entities/stellar-wallet.entity';
import { LoyaltyToken } from './entities/loyalty-token.entity';
import { LoyaltyBalance } from './entities/loyalty-balance.entity';
import { TokenTransaction } from './entities/token-transaction.entity';
import { Repository } from 'typeorm';
import { ExchangeAsset } from './dtos/exchange-rate.dto';

describe('StellarService', () => {
  let service: StellarService;
  let transactionRepository: Repository<StellarTransaction>;
  let walletRepository: Repository<StellarWallet>;
  let loyaltyTokenRepository: Repository<LoyaltyToken>;
  let loyaltyBalanceRepository: Repository<LoyaltyBalance>;
  let tokenTransactionRepository: Repository<TokenTransaction>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StellarService,
        {
          provide: getRepositoryToken(StellarTransaction),
          useClass: Repository,
        },
        {
          provide: getRepositoryToken(StellarWallet),
          useClass: Repository,
        },
        {
          provide: getRepositoryToken(LoyaltyToken),
          useClass: Repository,
        },
        {
          provide: getRepositoryToken(LoyaltyBalance),
          useClass: Repository,
        },
        {
          provide: getRepositoryToken(TokenTransaction),
          useClass: Repository,
        },
      ],
    }).compile();

    service = module.get<StellarService>(StellarService);
    transactionRepository = module.get<Repository<StellarTransaction>>(
      getRepositoryToken(StellarTransaction),
    );
    walletRepository = module.get<Repository<StellarWallet>>(
      getRepositoryToken(StellarWallet),
    );
    loyaltyTokenRepository = module.get<Repository<LoyaltyToken>>(
      getRepositoryToken(LoyaltyToken),
    );
    loyaltyBalanceRepository = module.get<Repository<LoyaltyBalance>>(
      getRepositoryToken(LoyaltyBalance),
    );
    tokenTransactionRepository = module.get<Repository<TokenTransaction>>(
      getRepositoryToken(TokenTransaction),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getExchangeRates', () => {
    it('should return exchange rates', async () => {
      const rates = await service.getExchangeRates();
      expect(rates).toHaveProperty('xlmToUsd');
      expect(rates).toHaveProperty('usdcToUsd');
      expect(typeof rates.xlmToUsd).toBe('number');
      expect(typeof rates.usdcToUsd).toBe('number');
    });
  });

  describe('calculateConversion', () => {
    it('should convert XLM to USDC', async () => {
      const result = await service.calculateConversion({
        fromAsset: ExchangeAsset.XLM,
        toAsset: ExchangeAsset.USDC,
        amount: 10,
      });
      expect(typeof result).toBe('number');
    });

    it('should convert USDC to XLM', async () => {
      const result = await service.calculateConversion({
        fromAsset: ExchangeAsset.USDC,
        toAsset: ExchangeAsset.XLM,
        amount: 10,
      });
      expect(typeof result).toBe('number');
    });
  });
});