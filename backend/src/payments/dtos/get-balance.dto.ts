import { IsString } from 'class-validator';

export class GetBalanceDto {
  @IsString()
  publicKey: string;
}