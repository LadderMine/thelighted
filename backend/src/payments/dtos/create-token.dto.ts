import { IsString, IsUUID, IsNumber, IsPositive, IsOptional, MaxLength } from 'class-validator';

export class CreateTokenDto {
  @IsUUID()
  restaurantId: string;

  @IsString()
  @MaxLength(20)
  tokenCode: string;

  @IsString()
  @MaxLength(12)
  assetCode: string;

  @IsNumber()
  @IsPositive()
  totalSupply: number;

  @IsNumber()
  @IsPositive()
  tokensPerDollar: number;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  redemptionValue?: number;

  @IsNumber()
  @IsOptional()
  expirationDays?: number;
}