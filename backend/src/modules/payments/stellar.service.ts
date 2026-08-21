// backend/src/modules/payments/stellar.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Asset,
  Horizon,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';

export interface BuildPaymentTransactionParams {
  sourceAccount: string;
  destinationAccount: string;
  /** 'XLM' for the native asset, otherwise a Stellar asset code (e.g. 'USDC'). */
  assetCode: string;
  /** Required unless assetCode === 'XLM'. */
  assetIssuer?: string;
  /** Decimal string, e.g. "12.5000000" — never a float, to avoid precision loss. */
  amount: string;
  memo?: string;
}

/**
 * Thin, testable wrapper around @stellar/stellar-sdk's Horizon.Server.
 * No business logic lives here (idempotency, persistence, retry policy) —
 * that's the next issue in the payment track. This issue only needs the
 * shape: load an account, build an unsigned payment transaction, submit an
 * already-signed one.
 */
@Injectable()
export class StellarService implements OnModuleInit {
  private readonly logger = new Logger(StellarService.name);
  private server: Horizon.Server;
  private networkPassphrase: string;

  constructor(private readonly configService: ConfigService) {}

  // Fail fast at boot rather than on first payment attempt — a missing or
  // mismatched Horizon/network config should never surface only when a
  // diner tries to pay (issue #312 edge case).
  onModuleInit(): void {
    const horizonUrl = this.configService.get<string>('STELLAR_HORIZON_URL');
    const network = this.configService.get<string>('STELLAR_NETWORK');

    if (!horizonUrl) {
      throw new Error('StellarService: STELLAR_HORIZON_URL is not configured');
    }
    if (!network) {
      throw new Error('StellarService: STELLAR_NETWORK is not configured');
    }

    this.networkPassphrase = StellarService.resolveNetworkPassphrase(network);
    this.server = new Horizon.Server(horizonUrl);

    this.logger.log(
      `Stellar service ready (network=${network}, horizon=${horizonUrl})`,
    );
  }

  private static resolveNetworkPassphrase(network: string): string {
    switch (network.toLowerCase()) {
      case 'public':
      case 'mainnet':
        return Networks.PUBLIC;
      case 'testnet':
        return Networks.TESTNET;
      case 'futurenet':
        return Networks.FUTURENET;
      default:
        throw new Error(
          `StellarService: unrecognized STELLAR_NETWORK "${network}" ` +
            '(expected one of: public, mainnet, testnet, futurenet)',
        );
    }
  }

  getNetworkPassphrase(): string {
    return this.networkPassphrase;
  }

  async loadAccount(publicKey: string): Promise<Horizon.AccountResponse> {
    return this.server.loadAccount(publicKey);
  }

  /** Builds an unsigned payment transaction and returns it as a base64 XDR envelope. */
  async buildPaymentTransaction(
    params: BuildPaymentTransactionParams,
  ): Promise<string> {
    const sourceAccount = await this.server.loadAccount(params.sourceAccount);
    const baseFee = await this.server.fetchBaseFee();
    const asset =
      params.assetCode === 'XLM'
        ? Asset.native()
        : new Asset(params.assetCode, params.assetIssuer);

    const transaction = new TransactionBuilder(sourceAccount, {
      fee: String(baseFee),
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        Operation.payment({
          destination: params.destinationAccount,
          asset,
          amount: params.amount,
        }),
      )
      .addMemo(params.memo ? Memo.text(params.memo) : Memo.none())
      .setTimeout(180)
      .build();

    return transaction.toXDR();
  }

  /** Submits an already-signed transaction envelope to Horizon. */
  async submitTransaction(
    signedTransactionXdr: string,
  ): Promise<Horizon.HorizonApi.SubmitTransactionResponse> {
    const transaction = TransactionBuilder.fromXDR(
      signedTransactionXdr,
      this.networkPassphrase,
    );
    return this.server.submitTransaction(transaction);
  }
}
