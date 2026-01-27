import { IsString, IsEnum, IsNumber, IsPositive } from 'class-validator';

export enum ExchangeAsset {
  XLM = 'XLM',
  USDC = 'USDC'
}

export class ExchangeRateDto {
  @IsEnum(ExchangeAsset)
  fromAsset: ExchangeAsset;

  @IsEnum(ExchangeAsset)
  toAsset: ExchangeAsset;

  @IsNumber()
  @IsPositive()
  amount: number;
}