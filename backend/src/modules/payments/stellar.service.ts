// backend/src/modules/payments/stellar.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Account,
  Asset,
  Horizon,
  Memo,
  Networks,
  NotFoundError,
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
  /**
   * The exact sequence number this transaction should carry (i.e. what
   * SequenceAllocator.allocate() returns), NOT the account's current
   * on-ledger sequence. TransactionBuilder always builds a transaction
   * whose seqNum is `source.sequenceNumber() + 1`, so callers supplying
   * this must not also expect the usual +1 — buildPaymentTransaction
   * compensates by constructing the Account one below this value.
   */
  sequenceOverride?: string;
}

export interface BuildTrustlineTransactionParams {
  sourceAccount: string;
  assetCode: string;
  assetIssuer: string;
}

export interface TrustlineBalance {
  /** 'XLM' for the native balance, otherwise the asset code (e.g. 'USDC'). */
  assetCode: string;
  /** null for the native balance — Asset.native() has no issuer. */
  assetIssuer: string | null;
  balance: string;
}

export interface AccountTrustlines {
  /**
   * false when the account doesn't exist on the network yet (issue #315
   * edge case: a brand-new address with zero XLM can't hold a trustline —
   * or anything — until it's funded with the minimum reserve).
   */
  funded: boolean;
  balances: TrustlineBalance[];
}

// Shared between the transaction builder's own timeout and the Payment's
// expiresAt bookkeeping (issue #314) so the two never drift apart.
export const TRANSACTION_TIMEOUT_SECONDS = 180;

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
    const sourceAccount = params.sequenceOverride
      ? new Account(
          params.sourceAccount,
          (BigInt(params.sequenceOverride) - 1n).toString(),
        )
      : await this.server.loadAccount(params.sourceAccount);
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
      .setTimeout(TRANSACTION_TIMEOUT_SECONDS)
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

  /**
   * Computes a transaction's hash locally from its (signed or unsigned)
   * XDR — deterministic, no network call. Used to record a Payment's
   * `stellarTxHash` BEFORE attempting submission (issue #314): if the
   * submit call itself errors ambiguously (timeout, dropped connection),
   * we still know which hash to independently verify later, rather than
   * having no way to look the transaction up at all.
   */
  computeTransactionHash(transactionXdr: string): string {
    const transaction = TransactionBuilder.fromXDR(
      transactionXdr,
      this.networkPassphrase,
    );
    return transaction.hash().toString('hex');
  }

  /**
   * Independently verifies a transaction against Horizon by hash — the
   * only thing allowed to justify a CONFIRMED status (issue #314). Throws
   * NotFoundError (re-exported by the caller's check) when the ledger has
   * no record of it yet, which is expected for a few seconds after
   * submission (propagation delay), not necessarily a failure.
   */
  async fetchTransaction(
    hash: string,
  ): Promise<Horizon.ServerApi.TransactionRecord> {
    return this.server.transactions().transaction(hash).call();
  }

  /**
   * Reports which assets `publicKey` already trusts, so #315's checkout UI
   * can offer a trustline-setup step before a payment attempt fails with
   * `op_no_trust` (see errors/horizon-error-mapper.ts). A NotFoundError here
   * means the account has never been created/funded on this network at
   * all — distinct from "funded but missing this one trustline" — so
   * callers can show the right guidance for each case.
   */
  async getAccountTrustlines(publicKey: string): Promise<AccountTrustlines> {
    try {
      const account = await this.server.loadAccount(publicKey);
      const balances: TrustlineBalance[] = account.balances.map((entry) => {
        if (entry.asset_type === 'native') {
          return { assetCode: 'XLM', assetIssuer: null, balance: entry.balance };
        }
        const trustline = entry as Horizon.HorizonApi.BalanceLineAsset;
        return {
          assetCode: trustline.asset_code,
          assetIssuer: trustline.asset_issuer,
          balance: trustline.balance,
        };
      });
      return { funded: true, balances };
    } catch (error) {
      if (error instanceof NotFoundError) {
        return { funded: false, balances: [] };
      }
      throw error;
    }
  }

  /**
   * Builds an unsigned `changeTrust` transaction so a diner's wallet can
   * establish a trustline before paying in a non-native asset (issue #315).
   * Always loads the account fresh (no sequence override): unlike payments,
   * trustline setup isn't behind SequenceAllocator — it's a one-off step the
   * diner takes sequentially, not a contended, idempotency-tracked resource.
   */
  async buildTrustlineTransaction(
    params: BuildTrustlineTransactionParams,
  ): Promise<string> {
    const sourceAccount = await this.server.loadAccount(params.sourceAccount);
    const baseFee = await this.server.fetchBaseFee();
    const asset = new Asset(params.assetCode, params.assetIssuer);

    const transaction = new TransactionBuilder(sourceAccount, {
      fee: String(baseFee),
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(Operation.changeTrust({ asset }))
      .setTimeout(TRANSACTION_TIMEOUT_SECONDS)
      .build();

    return transaction.toXDR();
  }
}
