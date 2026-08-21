import { Account, Keypair, Networks } from '@stellar/stellar-sdk';
import { StellarService } from './stellar.service';

// Real, validly-checksummed keys generated at test time — hand-typed
// StrKey addresses are easy to get subtly wrong (invalid checksum).
const sourceKeypair = Keypair.random();
const destinationKeypair = Keypair.random();

const mockLoadAccount = jest.fn();
const mockFetchBaseFee = jest.fn();
const mockSubmitTransaction = jest.fn();

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
});
