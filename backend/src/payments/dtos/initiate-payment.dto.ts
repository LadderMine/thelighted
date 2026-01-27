import { IsString, IsEnum, IsNumber, IsPositive, IsOptional, IsUUID } from 'class-validator';

export enum AssetType {
  XLM = 'XLM',
  USDC = 'USDC'
}

export class InitiatePaymentDto {
  @IsUUID()
  orderId: string;

  @IsEnum(AssetType)
  asset: AssetType;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsString()
  @IsOptional()
  memo?: string;
}