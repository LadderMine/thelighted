import { IsString, IsEnum } from 'class-validator';

export enum WalletType {
  FREIGHTER = 'FREIGHTER',
  ALBEDO = 'ALBEDO',
  LOBSTR = 'LOBSTR'
}

export class ConnectWalletDto {
  @IsString()
  publicKey: string;

  @IsEnum(WalletType)
  walletType: WalletType;

  @IsString()
  signature: string;

  @IsString()
  challenge: string;
}