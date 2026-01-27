import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import NodeCache from 'node-cache';

import { StellarTransaction, TransactionStatus, TransactionType, AssetType } from '../entities/stellar-transaction.entity';
import { StellarWallet } from '../entities/stellar-wallet.entity';
import { LoyaltyToken } from '../entities/loyalty-token.entity';
import { LoyaltyBalance } from '../entities/loyalty-balance.entity';
import { TokenTransaction, TokenType } from '../entities/token-transaction.entity';
import { InitiatePaymentDto } from '../dtos/initiate-payment.dto';
import { ConfirmPaymentDto } from '../dtos/confirm-payment.dto';
import { ConnectWalletDto, WalletType } from '../dtos/connect-wallet.dto';
import { CreateTokenDto } from '../dtos/create-token.dto';
import { IssueTokensDto } from '../dtos/issue-tokens.dto';
import { RedeemTokensDto } from '../dtos/redeem-tokens.dto';
import { ExchangeRateDto, ExchangeAsset } from '../dtos/exchange-rate.dto';

@Injectable()
export class StellarService {
  private readonly logger = new Logger(StellarService.name);
  private readonly cache: NodeCache;

  constructor(
    @InjectRepository(StellarTransaction)
    private readonly transactionRepository: Repository<StellarTransaction>,
    @InjectRepository(StellarWallet)
    private readonly walletRepository: Repository<StellarWallet>,
    @InjectRepository(LoyaltyToken)
    private readonly loyaltyTokenRepository: Repository<LoyaltyToken>,
    @InjectRepository(LoyaltyBalance)
    private readonly loyaltyBalanceRepository: Repository<LoyaltyBalance>,
    @InjectRepository(TokenTransaction)
    private readonly tokenTransactionRepository: Repository<TokenTransaction>,
  ) {
    this.cache = new NodeCache({ stdTTL: 30 }); // 30 seconds cache
  }

  /**
   * Get current exchange rates for XLM/USDC
   */
  async getExchangeRates(): Promise<{ xlmToUsd: number; usdcToUsd: number }> {
    const cachedRates = this.cache.get('exchange_rates');
    if (cachedRates) {
      return cachedRates as { xlmToUsd: number; usdcToUsd: number };
    }

    try {
      // Simulated exchange rates - in a real implementation, this would call an external API
      const xlmToUsd = 0.10; // $0.10 per XLM
      const usdcToUsd = 1.00; // $1.00 per USDC

      const rates = { xlmToUsd, usdcToUsd };
      this.cache.set('exchange_rates', rates);
      
      return rates;
    } catch (error) {
      this.logger.error(`Error fetching exchange rates: ${error.message}`);
      throw new BadRequestException('Could not fetch exchange rates');
    }
  }

  /**
   * Calculate conversion between assets
   */
  async calculateConversion(dto: ExchangeRateDto): Promise<number> {
    const rates = await this.getExchangeRates();
    
    if (dto.fromAsset === ExchangeAsset.XLM && dto.toAsset === ExchangeAsset.USDC) {
      // XLM -> USDC
      const usdValue = dto.amount * rates.xlmToUsd;
      return usdValue / rates.usdcToUsd;
    } else if (dto.fromAsset === ExchangeAsset.USDC && dto.toAsset === ExchangeAsset.XLM) {
      // USDC -> XLM
      const usdValue = dto.amount * rates.usdcToUsd;
      return usdValue / rates.xlmToUsd;
    } else if (dto.fromAsset === dto.toAsset) {
      return dto.amount;
    } else {
      throw new BadRequestException('Unsupported conversion pair');
    }
  }

  /**
   * Initiate a Stellar payment
   */
  async initiatePayment(dto: InitiatePaymentDto): Promise<any> {
    try {
      // Validate order exists and is unpaid (this would need integration with order service)
      // For now, we'll simulate validation
      
      // Get restaurant wallet address (this would come from restaurant service)
      const restaurantPublicKey = process.env.RESTAURANT_WALLET_PUBLIC_KEY || 'G...'; // Replace with actual restaurant wallet
      
      // Calculate exchange rates
      const rates = await this.getExchangeRates();
      let cryptoAmount: number;
      
      if (dto.asset === AssetType.XLM) {
        // Assuming the amount passed is in USD
        cryptoAmount = dto.amount / rates.xlmToUsd;
      } else if (dto.asset === AssetType.USDC) {
        cryptoAmount = dto.amount / rates.usdcToUsd;
      } else {
        throw new BadRequestException(`Unsupported asset: ${dto.asset}`);
      }

      // Generate a unique memo for the transaction
      const memo = dto.memo || `ORDER-${dto.orderId.substring(0, 8)}`;
      
      // Create pending transaction record
      const transaction = new StellarTransaction();
      transaction.orderId = dto.orderId;
      transaction.transactionHash = null; // Will be filled when confirmed
      transaction.fromAddress = null; // Will be filled when confirmed
      transaction.toAddress = restaurantPublicKey;
      transaction.asset = dto.asset;
      transaction.amount = cryptoAmount;
      transaction.amountInUSD = dto.amount;
      transaction.fee = 0.00001; // Base fee in XLM
      transaction.status = TransactionStatus.PENDING;
      transaction.memo = memo;
      transaction.transactionType = TransactionType.PAYMENT;
      
      const savedTransaction = await this.transactionRepository.save(transaction);

      return {
        transactionId: savedTransaction.id,
        amount: cryptoAmount,
        destination: restaurantPublicKey,
        memo,
        asset: dto.asset,
        amountInUSD: dto.amount,
        expiresAt: new Date(Date.now() + 180000) // Expires in 3 minutes
      };
    } catch (error) {
      this.logger.error(`Error initiating payment: ${error.message}`);
      throw new BadRequestException(`Payment initiation failed: ${error.message}`);
    }
  }

  /**
   * Confirm a Stellar payment by verifying on the blockchain
   */
  async confirmPayment(dto: ConfirmPaymentDto): Promise<any> {
    try {
      // Get the pending transaction from our records
      const storedTransaction = await this.transactionRepository.findOne({
        where: { orderId: dto.orderId, status: TransactionStatus.PENDING }
      });

      if (!storedTransaction) {
        throw new NotFoundException('Pending transaction not found for this order');
      }

      // In a real implementation, we would verify the transaction on the Stellar network
      // For now, we'll simulate the verification process
      
      // Simulate transaction verification on Stellar network
      const isValid = true; // Simulate successful verification
      
      if (!isValid) {
        storedTransaction.status = TransactionStatus.FAILED;
        await this.transactionRepository.save(storedTransaction);
        throw new BadRequestException('Transaction validation failed');
      }

      // Update stored transaction with network details
      storedTransaction.transactionHash = dto.transactionHash;
      storedTransaction.fromAddress = 'G...'; // Would be actual sender address
      storedTransaction.toAddress = storedTransaction.toAddress; // Destination address
      storedTransaction.amount = storedTransaction.amount; // Amount from stored transaction
      storedTransaction.blockNumber = BigInt(Math.floor(Math.random() * 1000000000)); // Random block number
      storedTransaction.ledger = Math.floor(Math.random() * 5000000); // Random ledger
      storedTransaction.confirmedAt = new Date();
      storedTransaction.status = TransactionStatus.CONFIRMED;

      await this.transactionRepository.save(storedTransaction);

      // Automatically issue loyalty tokens if payment is confirmed
      await this.issueLoyaltyTokensOnPayment(storedTransaction);

      return {
        status: 'CONFIRMED',
        transaction: storedTransaction
      };
    } catch (error) {
      this.logger.error(`Error confirming payment: ${error.message}`);
      throw new BadRequestException(`Payment confirmation failed: ${error.message}`);
    }
  }

  /**
   * Issue loyalty tokens automatically when payment is confirmed
   */
  private async issueLoyaltyTokensOnPayment(transaction: StellarTransaction): Promise<void> {
    try {
      // Find the loyalty token for this restaurant
      // This would typically involve linking orders to restaurants
      // For now, we'll use a placeholder restaurant ID
      const loyaltyToken = await this.loyaltyTokenRepository.findOne({
        where: { restaurantId: 'placeholder_restaurant_id', isActive: true }
      });

      if (!loyaltyToken) {
        this.logger.warn('No active loyalty token found for restaurant');
        return;
      }

      // Calculate tokens to award based on purchase amount
      const tokensToIssue = Math.floor(transaction.amountInUSD * loyaltyToken.tokensPerDollar);

      if (tokensToIssue <= 0) {
        this.logger.warn('No tokens to issue for this transaction');
        return;
      }

      // Find customer's wallet to send tokens to
      // This would need to be linked to the user who made the purchase
      const customerWallet = await this.walletRepository.findOne({
        where: { userId: 'placeholder_user_id' } // Would come from order
      });

      if (!customerWallet || !customerWallet.isVerified) {
        this.logger.warn('Customer wallet not found or not verified');
        return;
      }

      // Issue tokens to customer
      await this.issueTokens({
        userId: customerWallet.userId,
        tokenId: loyaltyToken.id,
        amount: tokensToIssue
      });

      this.logger.log(`Issued ${tokensToIssue} loyalty tokens to user ${customerWallet.userId}`);
    } catch (error) {
      this.logger.error(`Error issuing loyalty tokens: ${error.message}`);
      // Don't throw here as the payment itself was successful
    }
  }

  /**
   * Connect a Stellar wallet
   */
  async connectWallet(dto: ConnectWalletDto): Promise<StellarWallet> {
    try {
      // In a real implementation, you'd verify the signature using Stellar's signing mechanisms
      // For now, we'll simulate verification
      const isValidSignature = true; // Simulate successful verification

      if (!isValidSignature) {
        throw new BadRequestException('Invalid wallet signature');
      }

      // Check if wallet already exists
      let wallet = await this.walletRepository.findOne({
        where: { publicKey: dto.publicKey }
      });

      if (wallet) {
        // Update existing wallet
        wallet.walletType = dto.walletType;
        wallet.isVerified = true;
        wallet.lastVerifiedAt = new Date();
        wallet.updatedAt = new Date();
      } else {
        // Create new wallet
        wallet = new StellarWallet();
        wallet.userId = uuidv4(); // In a real app, this would come from authenticated user
        wallet.publicKey = dto.publicKey;
        wallet.walletType = dto.walletType;
        wallet.isVerified = true;
        wallet.lastVerifiedAt = new Date();
      }

      return await this.walletRepository.save(wallet);
    } catch (error) {
      this.logger.error(`Error connecting wallet: ${error.message}`);
      throw new BadRequestException(`Wallet connection failed: ${error.message}`);
    }
  }

  /**
   * Get wallet balance
   */
  async getWalletBalance(publicKey: string): Promise<any[]> {
    try {
      // In a real implementation, this would call the Stellar Horizon API
      // For now, we'll return simulated balances
      
      return [
        {
          asset: 'XLM',
          issuer: null,
          balance: '100.50',
          limit: null
        },
        {
          asset: 'USDC',
          issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
          balance: '500.00',
          limit: '10000.00'
        }
      ];
    } catch (error) {
      this.logger.error(`Error fetching wallet balance: ${error.message}`);
      throw new BadRequestException(`Could not fetch wallet balance: ${error.message}`);
    }
  }

  /**
   * Get wallet transaction history
   */
  async getWalletTransactions(publicKey: string, limit: number = 10): Promise<any[]> {
    try {
      // In a real implementation, this would call the Stellar Horizon API
      // For now, we'll return simulated transaction history
      
      return [
        {
          id: '12345',
          hash: 'abc123...',
          ledger: 12345678,
          createdAt: new Date(),
          sourceAccount: publicKey,
          operationCount: 1,
          memo: 'Payment for order #123',
          memoType: 'text'
        },
        {
          id: '12344',
          hash: 'def456...',
          ledger: 12345677,
          createdAt: new Date(Date.now() - 86400000), // Yesterday
          sourceAccount: publicKey,
          operationCount: 1,
          memo: 'Received tokens',
          memoType: 'text'
        }
      ];
    } catch (error) {
      this.logger.error(`Error fetching wallet transactions: ${error.message}`);
      throw new BadRequestException(`Could not fetch wallet transactions: ${error.message}`);
    }
  }

  /**
   * Create a loyalty token
   */
  async createToken(dto: CreateTokenDto): Promise<LoyaltyToken> {
    try {
      // Check if token code already exists
      const existingToken = await this.loyaltyTokenRepository.findOne({
        where: { tokenCode: dto.tokenCode }
      });

      if (existingToken) {
        throw new BadRequestException('Token code already exists');
      }

      // In a real implementation, we would create a Stellar account for token issuance
      // For now, we'll use a placeholder issuer address
      const issuerAddress = process.env.LOYALTY_TOKEN_ISSUER_PUBLIC_KEY || `GA${Math.random().toString(36).substring(2, 34)}`;

      const token = new LoyaltyToken();
      token.restaurantId = dto.restaurantId;
      token.tokenCode = dto.tokenCode;
      token.assetCode = dto.assetCode;
      token.issuerAddress = issuerAddress;
      token.totalSupply = BigInt(dto.totalSupply);
      token.circulatingSupply = BigInt(0);
      token.tokensPerDollar = dto.tokensPerDollar;
      token.redemptionValue = dto.redemptionValue || 0.01; // Default $0.01 per token
      token.expirationDays = dto.expirationDays || null;
      token.isActive = true;

      return await this.loyaltyTokenRepository.save(token);
    } catch (error) {
      this.logger.error(`Error creating loyalty token: ${error.message}`);
      throw new BadRequestException(`Token creation failed: ${error.message}`);
    }
  }

  /**
   * Issue tokens to a user
   */
  async issueTokens(dto: IssueTokensDto): Promise<TokenTransaction> {
    try {
      // Get token details
      const token = await this.loyaltyTokenRepository.findOne({
        where: { id: dto.tokenId }
      });

      if (!token) {
        throw new NotFoundException('Token not found');
      }

      // Get user's wallet
      const wallet = await this.walletRepository.findOne({
        where: { userId: dto.userId, isVerified: true }
      });

      if (!wallet) {
        throw new BadRequestException('User wallet not found or not verified');
      }

      // Check if there are enough tokens available in the supply
      const tokensAvailable = token.totalSupply - token.circulatingSupply;
      if (tokensAvailable < BigInt(dto.amount)) {
        throw new BadRequestException('Not enough tokens available in supply');
      }

      // In a real implementation, we would actually send tokens on the Stellar network
      // For now, we'll just update the database records

      // Update circulating supply
      token.circulatingSupply += BigInt(dto.amount);
      await this.loyaltyTokenRepository.save(token);

      // Update user's balance
      let userBalance = await this.loyaltyBalanceRepository.findOne({
        where: { userId: dto.userId, tokenId: dto.tokenId }
      });

      if (!userBalance) {
        userBalance = new LoyaltyBalance();
        userBalance.userId = dto.userId;
        userBalance.tokenId = dto.tokenId;
        userBalance.balance = BigInt(0);
        userBalance.lifetimeEarned = BigInt(0);
        userBalance.lifetimeRedeemed = BigInt(0);
      }

      userBalance.balance += BigInt(dto.amount);
      userBalance.lifetimeEarned += BigInt(dto.amount);
      userBalance.lastEarnedAt = new Date();
      userBalance.updatedAt = new Date();

      await this.loyaltyBalanceRepository.save(userBalance);

      // Create token transaction record
      const tokenTx = new TokenTransaction();
      tokenTx.tokenId = dto.tokenId;
      tokenTx.userId = dto.userId;
      tokenTx.transactionHash = `TX-${uuidv4()}`; // Placeholder transaction hash
      tokenTx.amount = BigInt(dto.amount);
      tokenTx.type = TokenType.EARNED;
      tokenTx.description = 'Tokens issued for purchase';

      return await this.tokenTransactionRepository.save(tokenTx);
    } catch (error) {
      this.logger.error(`Error issuing tokens: ${error.message}`);
      throw new BadRequestException(`Token issuance failed: ${error.message}`);
    }
  }

  /**
   * Redeem tokens
   */
  async redeemTokens(dto: RedeemTokensDto): Promise<TokenTransaction> {
    try {
      // Get user's token balance
      const userBalance = await this.loyaltyBalanceRepository.findOne({
        where: { userId: dto.userId, tokenId: dto.tokenId }
      });

      if (!userBalance || userBalance.balance < BigInt(dto.amount)) {
        throw new BadRequestException('Insufficient token balance');
      }

      // Get token details
      const token = await this.loyaltyTokenRepository.findOne({
        where: { id: dto.tokenId }
      });

      if (!token || !token.isActive) {
        throw new BadRequestException('Token is not active');
      }

      // In a real implementation, we would actually transfer tokens on the Stellar network
      // For now, we'll just update the database records

      // Update user's balance
      userBalance.balance -= BigInt(dto.amount);
      userBalance.lifetimeRedeemed += BigInt(dto.amount);
      userBalance.lastRedeemedAt = new Date();
      userBalance.updatedAt = new Date();

      await this.loyaltyBalanceRepository.save(userBalance);

      // Update circulating supply
      token.circulatingSupply -= BigInt(dto.amount);
      await this.loyaltyTokenRepository.save(token);

      // Create token transaction record
      const tokenTx = new TokenTransaction();
      tokenTx.tokenId = dto.tokenId;
      tokenTx.userId = dto.userId;
      tokenTx.transactionHash = `TX-${uuidv4()}`; // Placeholder transaction hash
      tokenTx.amount = BigInt(dto.amount);
      tokenTx.type = TokenType.REDEEMED;
      tokenTx.description = 'Tokens redeemed for reward';

      return await this.tokenTransactionRepository.save(tokenTx);
    } catch (error) {
      this.logger.error(`Error redeeming tokens: ${error.message}`);
      throw new BadRequestException(`Token redemption failed: ${error.message}`);
    }
  }

  /**
   * Get token information
   */
  async getTokenInfo(tokenCode: string): Promise<LoyaltyToken> {
    const token = await this.loyaltyTokenRepository.findOne({
      where: { tokenCode, isActive: true }
    });

    if (!token) {
      throw new NotFoundException('Token not found');
    }

    return token;
  }

  /**
   * Get token holders
   */
  async getTokenHolders(tokenId: string): Promise<any[]> {
    const balances = await this.loyaltyBalanceRepository.find({
      where: { tokenId },
      order: { balance: 'DESC' }
    });

    return balances.map(balance => ({
      userId: balance.userId,
      balance: balance.balance.toString(),
      percentage: ((Number(balance.balance) / Number(balance.balance)) * 100).toFixed(2) // Simplified calculation
    }));
  }

  /**
   * Process refund
   */
  async processRefund(transactionHash: string): Promise<StellarTransaction> {
    // Get the original transaction
    const originalTransaction = await this.transactionRepository.findOne({
      where: { transactionHash }
    });

    if (!originalTransaction) {
      throw new NotFoundException('Transaction not found');
    }

    if (originalTransaction.status !== TransactionStatus.CONFIRMED) {
      throw new BadRequestException('Cannot refund non-confirmed transaction');
    }

    // In a real implementation, we would create a refund transaction on the Stellar network
    // For now, we'll create a refund record in our database

    const refundTransaction = new StellarTransaction();
    refundTransaction.orderId = originalTransaction.orderId;
    refundTransaction.transactionHash = `REFUND-${transactionHash}`;
    refundTransaction.fromAddress = originalTransaction.toAddress; // Reverse the addresses
    refundTransaction.toAddress = originalTransaction.fromAddress;
    refundTransaction.asset = originalTransaction.asset;
    refundTransaction.amount = originalTransaction.amount;
    refundTransaction.amountInUSD = originalTransaction.amountInUSD;
    refundTransaction.fee = originalTransaction.fee;
    refundTransaction.status = TransactionStatus.CONFIRMED; // Assume refund is processed
    refundTransaction.memo = `REFUND-${originalTransaction.memo}`;
    refundTransaction.transactionType = TransactionType.REFUND;

    return await this.transactionRepository.save(refundTransaction);
  }

  /**
   * Get transaction details by hash
   */
  async getTransactionByHash(transactionHash: string): Promise<StellarTransaction> {
    const transaction = await this.transactionRepository.findOne({
      where: { transactionHash }
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    return transaction;
  }
}