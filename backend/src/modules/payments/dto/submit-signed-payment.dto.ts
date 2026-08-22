// backend/src/modules/payments/dto/submit-signed-payment.dto.ts
import { IsNotEmpty, IsString } from 'class-validator';

export class SubmitSignedPaymentDto {
  @IsString()
  @IsNotEmpty()
  signedTransactionXdr: string;
}
