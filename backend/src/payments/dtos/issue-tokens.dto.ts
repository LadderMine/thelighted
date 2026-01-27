import { IsString, IsUUID, IsNumber, IsPositive } from 'class-validator';

export class IssueTokensDto {
  @IsUUID()
  userId: string;

  @IsUUID()
  tokenId: string;

  @IsNumber()
  @IsPositive()
  amount: number;
}