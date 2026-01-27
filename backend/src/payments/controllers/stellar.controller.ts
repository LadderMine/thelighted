import { Controller, Post, Get, Body, Param, Query, UsePipes, ValidationPipe } from '@nestjs/common';
import { StellarService } from '../services/stellar.service';
import { InitiatePaymentDto } from '../dtos/initiate-payment.dto';
import { ConfirmPaymentDto } from '../dtos/confirm-payment.dto';
import { ConnectWalletDto } from '../dtos/connect-wallet.dto';
import { CreateTokenDto } from '../dtos/create-token.dto';
import { IssueTokensDto } from '../dtos/issue-tokens.dto';
import { RedeemTokensDto } from '../dtos/redeem-tokens.dto';
import { ExchangeRateDto } from '../dtos/exchange-rate.dto';
import { RefundPaymentDto } from '../dtos/refund-payment.dto';

@Controller('api/payments/stellar')
export class StellarController {
  constructor(private readonly stellarService: StellarService) {}

  @Post('/initiate')
  @UsePipes(ValidationPipe)
  async initiatePayment(@Body() initiatePaymentDto: InitiatePaymentDto) {
    return this.stellarService.initiatePayment(initiatePaymentDto);
  }

  @Post('/confirm')
  @UsePipes(ValidationPipe)
  async confirmPayment(@Body() confirmPaymentDto: ConfirmPaymentDto) {
    return this.stellarService.confirmPayment(confirmPaymentDto);
  }

  @Get('/:transactionHash')
  async getTransactionDetails(@Param('transactionHash') transactionHash: string) {
    return this.stellarService.getTransactionByHash(transactionHash);
  }

  @Post('/refund')
  @UsePipes(ValidationPipe)
  async processRefund(@Body() refundDto: RefundPaymentDto) {
    return this.stellarService.processRefund(refundDto.transactionHash);
  }

  @Post('/wallets/connect')
  @UsePipes(ValidationPipe)
  async connectWallet(@Body() connectWalletDto: ConnectWalletDto) {
    return this.stellarService.connectWallet(connectWalletDto);
  }

  @Get('/wallets/balance')
  async getWalletBalance(@Query('publicKey') publicKey: string) {
    return this.stellarService.getWalletBalance(publicKey);
  }

  @Get('/wallets/transactions')
  async getWalletTransactions(
    @Query('publicKey') publicKey: string,
    @Query('limit') limit: number = 10
  ) {
    return this.stellarService.getWalletTransactions(publicKey, limit);
  }

  @Post('/wallets/verify')
  @UsePipes(ValidationPipe)
  async verifyWallet(@Body() connectWalletDto: ConnectWalletDto) {
    // For simplicity, we'll use the same connect endpoint logic
    return this.stellarService.connectWallet(connectWalletDto);
  }

  @Post('/loyalty/tokens/create')
  @UsePipes(ValidationPipe)
  async createToken(@Body() createTokenDto: CreateTokenDto) {
    return this.stellarService.createToken(createTokenDto);
  }

  @Post('/loyalty/tokens/issue')
  @UsePipes(ValidationPipe)
  async issueTokens(@Body() issueTokensDto: IssueTokensDto) {
    return this.stellarService.issueTokens(issueTokensDto);
  }

  @Get('/loyalty/tokens/:tokenCode')
  async getTokenInfo(@Param('tokenCode') tokenCode: string) {
    return this.stellarService.getTokenInfo(tokenCode);
  }

  @Get('/loyalty/tokens/holders')
  async getTokenHolders(@Query('tokenId') tokenId: string) {
    return this.stellarService.getTokenHolders(tokenId);
  }

  @Post('/loyalty/tokens/redeem')
  @UsePipes(ValidationPipe)
  async redeemTokens(@Body() redeemTokensDto: RedeemTokensDto) {
    return this.stellarService.redeemTokens(redeemTokensDto);
  }

  @Get('/exchange-rates')
  async getExchangeRates() {
    return this.stellarService.getExchangeRates();
  }

  @Post('/exchange-rates/calculate')
  @UsePipes(ValidationPipe)
  async calculateExchangeRate(@Body() exchangeRateDto: ExchangeRateDto) {
    return this.stellarService.calculateConversion(exchangeRateDto);
  }
}