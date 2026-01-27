import { IsString, IsUUID, IsNumber, IsPositive } from 'class-validator';

export class RefundPaymentDto {
  @IsString()
  transactionHash: string;

  @IsUUID()
  orderId: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsString()
  reason: string;
}