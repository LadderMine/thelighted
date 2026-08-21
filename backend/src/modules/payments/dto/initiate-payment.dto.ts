// backend/src/modules/payments/dto/initiate-payment.dto.ts
import {
  IsIn,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

export class InitiatePaymentDto {
  @IsUUID()
  orderId: string;

  // The diner's own wallet — the transaction's source account. Signing
  // happens client-side (ADR 0001's non-custodial model); the backend never
  // holds this account's key.
  @IsString()
  @Length(56, 56)
  sourceAccount: string;

  @IsString()
  @IsIn(['XLM', 'USDC'])
  assetCode: string;

  @IsOptional()
  @IsString()
  @Length(56, 56)
  assetIssuer?: string;

  @IsNumberString()
  amount: string;

  // Supplied by the client (not generated server-side) so a retried HTTP
  // request after a dropped response reuses the same key instead of minting
  // a new payment (issue #312/#313's duplicate-charge concern).
  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  idempotencyKey: string;
}
