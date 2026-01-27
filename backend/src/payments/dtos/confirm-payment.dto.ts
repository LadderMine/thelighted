import { IsString, IsUUID } from 'class-validator';

export class ConfirmPaymentDto {
  @IsString()
  transactionHash: string;

  @IsUUID()
  orderId: string;
}