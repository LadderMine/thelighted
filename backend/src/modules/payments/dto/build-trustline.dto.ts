// backend/src/modules/payments/dto/build-trustline.dto.ts
import { IsIn, IsString, Length } from 'class-validator';

export class BuildTrustlineDto {
  // The diner's own wallet — same non-custodial constraint as
  // InitiatePaymentDto.sourceAccount (ADR 0001).
  @IsString()
  @Length(56, 56)
  sourceAccount: string;

  // Only USDC needs a trustline today (XLM is native); kept as an allowlist
  // rather than a free string so this can't be used to build a changeTrust
  // transaction for an arbitrary/unvetted asset.
  @IsString()
  @IsIn(['USDC'])
  assetCode: string;

  @IsString()
  @Length(56, 56)
  assetIssuer: string;
}
