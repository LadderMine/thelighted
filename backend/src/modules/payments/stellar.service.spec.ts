import { Account, Keypair, Networks, NotFoundError } from '@stellar/stellar-sdk';
import { StellarService } from './stellar.service';

// Real, validly-checksummed keys generated at test time — hand-typed
// StrKey addresses are easy to get subtly wrong (invalid checksum).
const sourceKeypair = Keypair.random();
const destinationKeypair = Keypair.random();

const mockLoadAccount = jest.fn();
const mockFetchBaseFee = jest.fn();
const mockSubmitTransaction = jest.fn();
const mockGetTransaction = jest.fn();

jest.mock('@stellar/stellar-sdk', () => {
  const actual = jest.requireActual('@stellar/stellar-sdk');
  return {
    ...actual,
    Horizon: {
      ...actual.Horizon,
      Server: jest.fn().mockImplementation(() => ({
        loadAccount: mockLoadAccount,
        fetchBaseFee: mockFetchBaseFee,
        submitTransaction: mockSubmitTransaction,
        transactions: jest.fn().mockImplementation(() => ({
          transaction: jest.fn().mockImplementation((hash: string) => ({
            call: () => mockGetTransaction(hash),
          })),
        })),
      })),
    },
  };
});

function makeConfigService(values: Record<string, string | undefined>) {
  return { get: jest.fn((key: string) => values[key]) };
}

function readyService(): StellarService {
  const service = new StellarService(
    makeConfigService({
      STELLAR_HORIZON_URL: 'https://horizon-testnet.stellar.org',
      STELLAR_NETWORK: 'testnet',
    }) as any,
  );
  service.onModuleInit();
  return service;
}

describe('StellarService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('throws when STELLAR_HORIZON_URL is missing', () => {
      const service = new StellarService(
        makeConfigService({ STELLAR_NETWORK: 'testnet' }) as any,
      );
      expect(() => service.onModuleInit()).toThrow(
        /STELLAR_HORIZON_URL is not configured/,
      );
    });

    it('throws when STELLAR_NETWORK is missing', () => {
      const service = new StellarService(
        makeConfigService({
          STELLAR_HORIZON_URL: 'https://horizon-testnet.stellar.org',
        }) as any,
      );
      expect(() => service.onModuleInit()).toThrow(
        /STELLAR_NETWORK is not configured/,
      );
    });

    it('throws when STELLAR_NETWORK is not a recognized value', () => {
      const service = new StellarService(
        makeConfigService({
          STELLAR_HORIZON_URL: 'https://horizon-testnet.stellar.org',
          STELLAR_NETWORK: 'not-a-real-network',
        }) as any,
      );
      expect(() => service.onModuleInit()).toThrow(
        /unrecognized STELLAR_NETWORK/,
      );
    });

    it('resolves the testnet passphrase and becomes ready', () => {
      const service = readyService();
      expect(service.getNetworkPassphrase()).toBe(Networks.TESTNET);
    });

    it('resolves the mainnet passphrase for "public"', () => {
      const service = new StellarService(
        makeConfigService({
          STELLAR_HORIZON_URL: 'https://horizon.stellar.org',
          STELLAR_NETWORK: 'public',
        }) as any,
      );
      service.onModuleInit();
      expect(service.getNetworkPassphrase()).toBe(Networks.PUBLIC);
    });
  });

  describe('loadAccount', () => {
    it('delegates to the Horizon server', async () => {
      const service = readyService();
      const fakeAccount = new Account(sourceKeypair.publicKey(), '1');
      mockLoadAccount.mockResolvedValueOnce(fakeAccount);

      const result = await service.loadAccount(sourceKeypair.publicKey());

      expect(mockLoadAccount).toHaveBeenCalledWith(sourceKeypair.publicKey());
      expect(result).toBe(fakeAccount);
    });
  });

  describe('buildPaymentTransaction', () => {
    it('builds a signable XDR envelope for a native XLM payment', async () => {
      const service = readyService();

      mockLoadAccount.mockResolvedValueOnce(
        new Account(sourceKeypair.publicKey(), '100'),
      );
      mockFetchBaseFee.mockResolvedValueOnce(100);

      const xdr = await service.buildPaymentTransaction({
        sourceAccount: sourceKeypair.publicKey(),
        destinationAccount: destinationKeypair.publicKey(),
        assetCode: 'XLM',
        amount: '10.5000000',
      });

      expect(typeof xdr).toBe('string');
      expect(xdr.length).toBeGreaterThan(0);
      expect(mockFetchBaseFee).toHaveBeenCalled();
    });

    it('builds a payment for a non-native asset given an issuer', async () => {
      const service = readyService();

      mockLoadAccount.mockResolvedValueOnce(
        new Account(sourceKeypair.publicKey(), '100'),
      );
      mockFetchBaseFee.mockResolvedValueOnce(100);

      const issuer = Keypair.random().publicKey();
      const xdr = await service.buildPaymentTransaction({
        sourceAccount: sourceKeypair.publicKey(),
        destinationAccount: destinationKeypair.publicKey(),
        assetCode: 'USDC',
        assetIssuer: issuer,
        amount: '5.0000000',
      });

      expect(typeof xdr).toBe('string');
      expect(xdr.length).toBeGreaterThan(0);
    });
  });

  describe('buildSplitPaymentTransaction (issue #316)', () => {
    it('builds one Operation.payment per leg in a single atomic transaction', async () => {
      const service = readyService();
      mockLoadAccount.mockResolvedValueOnce(
        new Account(sourceKeypair.publicKey(), '100'),
      );
      mockFetchBaseFee.mockResolvedValueOnce(100);

      const feeKeypair = Keypair.random();
      const xdr = await service.buildSplitPaymentTransaction({
        sourceAccount: sourceKeypair.publicKey(),
        assetCode: 'XLM',
        legs: [
          { destinationAccount: destinationKeypair.publicKey(), amount: '9.7500000' },
          { destinationAccount: feeKeypair.publicKey(), amount: '0.2500000' },
        ],
      });

      const { TransactionBuilder, Networks: N } = jest.requireActual(
        '@stellar/stellar-sdk',
      );
      const parsed = TransactionBuilder.fromXDR(xdr, N.TESTNET);

      expect(parsed.operations).toHaveLength(2);
      expect(parsed.operations[0]).toMatchObject({
        type: 'payment',
        destination: destinationKeypair.publicKey(),
        amount: '9.7500000',
      });
      expect(parsed.operations[1]).toMatchObject({
        type: 'payment',
        destination: feeKeypair.publicKey(),
        amount: '0.2500000',
      });
    });

    it('throws when called with zero legs', async () => {
      const service = readyService();
      await expect(
        service.buildSplitPaymentTransaction({
          sourceAccount: sourceKeypair.publicKey(),
          assetCode: 'XLM',
          legs: [],
        }),
      ).rejects.toThrow(/at least one leg is required/);
      expect(mockLoadAccount).not.toHaveBeenCalled();
    });
  });

  describe('signTransactionWithKeypair (issue #316)', () => {
    it('signs an unsigned envelope, producing a transaction with one more signature', async () => {
      const service = readyService();
      mockLoadAccount.mockResolvedValueOnce(
        new Account(sourceKeypair.publicKey(), '100'),
      );
      mockFetchBaseFee.mockResolvedValueOnce(100);

      const unsignedXdr = await service.buildPaymentTransaction({
        sourceAccount: sourceKeypair.publicKey(),
        destinationAccount: destinationKeypair.publicKey(),
        assetCode: 'XLM',
        amount: '1.0000000',
      });

      const signedXdr = service.signTransactionWithKeypair(
        unsignedXdr,
        sourceKeypair,
      );

      const { TransactionBuilder, Networks: N } = jest.requireActual(
        '@stellar/stellar-sdk',
      );
      const unsignedParsed = TransactionBuilder.fromXDR(unsignedXdr, N.TESTNET);
      const signedParsed = TransactionBuilder.fromXDR(signedXdr, N.TESTNET);

      expect(unsignedParsed.signatures).toHaveLength(0);
      expect(signedParsed.signatures).toHaveLength(1);
      // Same underlying transaction — signing must not alter its hash.
      expect(signedParsed.hash().toString('hex')).toBe(
        unsignedParsed.hash().toString('hex'),
      );
    });
  });

  describe('submitTransaction', () => {
    it('parses the signed XDR and submits it to Horizon', async () => {
      const service = readyService();

      mockLoadAccount.mockResolvedValueOnce(
        new Account(sourceKeypair.publicKey(), '100'),
      );
      mockFetchBaseFee.mockResolvedValueOnce(100);

      const xdr = await service.buildPaymentTransaction({
        sourceAccount: sourceKeypair.publicKey(),
        destinationAccount: destinationKeypair.publicKey(),
        assetCode: 'XLM',
        amount: '1.0000000',
      });

      mockSubmitTransaction.mockResolvedValueOnce({
        hash: 'fake-hash',
        successful: true,
      });

      const result = await service.submitTransaction(xdr);

      expect(mockSubmitTransaction).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ hash: 'fake-hash', successful: true });
    });
  });

  describe('computeTransactionHash', () => {
    it('computes a deterministic hex hash locally, without any network call', async () => {
      const service = readyService();
      mockLoadAccount.mockResolvedValueOnce(
        new Account(sourceKeypair.publicKey(), '100'),
      );
      mockFetchBaseFee.mockResolvedValueOnce(100);

      const xdr = await service.buildPaymentTransaction({
        sourceAccount: sourceKeypair.publicKey(),
        destinationAccount: destinationKeypair.publicKey(),
        assetCode: 'XLM',
        amount: '1.0000000',
      });

      const hash = service.computeTransactionHash(xdr);

      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(mockSubmitTransaction).not.toHaveBeenCalled();
      // Deterministic: computing it again from the same XDR yields the same hash.
      expect(service.computeTransactionHash(xdr)).toBe(hash);
    });
  });

  describe('fetchTransaction', () => {
    it('delegates to Horizon transactions().transaction(hash).call()', async () => {
      const service = readyService();
      mockGetTransaction.mockResolvedValueOnce({
        hash: 'abc123',
        successful: true,
      });

      const result = await service.fetchTransaction('abc123');

      expect(mockGetTransaction).toHaveBeenCalledWith('abc123');
      expect(result).toEqual({ hash: 'abc123', successful: true });
    });

    it('propagates a rejection (e.g. NotFoundError) to the caller', async () => {
      const service = readyService();
      const notFound = new Error('not found');
      mockGetTransaction.mockRejectedValueOnce(notFound);

      await expect(service.fetchTransaction('missing-hash')).rejects.toThrow(
        'not found',
      );
    });
  });

  describe('getAccountTrustlines', () => {
    it('reports funded:false for an account that does not exist on the network', async () => {
      const service = readyService();
      mockLoadAccount.mockRejectedValueOnce(new NotFoundError('not found', {}));

      const result = await service.getAccountTrustlines(
        sourceKeypair.publicKey(),
      );

      expect(result).toEqual({ funded: false, balances: [] });
    });

    it('propagates a non-NotFoundError failure instead of swallowing it', async () => {
      const service = readyService();
      const outage = new Error('horizon unreachable');
      mockLoadAccount.mockRejectedValueOnce(outage);

      await expect(
        service.getAccountTrustlines(sourceKeypair.publicKey()),
      ).rejects.toThrow('horizon unreachable');
    });

    it('maps native and non-native balances to a flat, typed list', async () => {
      const service = readyService();
      const issuer = Keypair.random().publicKey();
      mockLoadAccount.mockResolvedValueOnce({
        balances: [
          { asset_type: 'native', balance: '42.0000000' },
          {
            asset_type: 'credit_alphanum4',
            asset_code: 'USDC',
            asset_issuer: issuer,
            balance: '10.0000000',
          },
        ],
      });

      const result = await service.getAccountTrustlines(
        sourceKeypair.publicKey(),
      );

      expect(result).toEqual({
        funded: true,
        balances: [
          { assetCode: 'XLM', assetIssuer: null, balance: '42.0000000' },
          { assetCode: 'USDC', assetIssuer: issuer, balance: '10.0000000' },
        ],
      });
    });
  });

  describe('buildTrustlineTransaction', () => {
    it('builds a signable changeTrust XDR envelope', async () => {
      const service = readyService();
      mockLoadAccount.mockResolvedValueOnce(
        new Account(sourceKeypair.publicKey(), '100'),
      );
      mockFetchBaseFee.mockResolvedValueOnce(100);

      const issuer = Keypair.random().publicKey();
      const xdr = await service.buildTrustlineTransaction({
        sourceAccount: sourceKeypair.publicKey(),
        assetCode: 'USDC',
        assetIssuer: issuer,
      });

      expect(typeof xdr).toBe('string');
      expect(xdr.length).toBeGreaterThan(0);
      expect(mockLoadAccount).toHaveBeenCalledWith(sourceKeypair.publicKey());
    });
  });
});
