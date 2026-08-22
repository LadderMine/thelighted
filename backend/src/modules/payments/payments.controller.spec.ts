import { Keypair } from '@stellar/stellar-sdk';
import { PaymentsController } from './payments.controller';
import { MalformedPaymentRequestError } from './errors/payment.errors';

// A real, validly-checksummed key — hand-typed StrKey addresses are easy to
// get subtly wrong (invalid checksum), which would make "valid key" tests
// accidentally exercise the "invalid key" path instead.
const validKey = Keypair.random().publicKey();

describe('PaymentsController', () => {
  let paymentsService: {
    initiate: jest.Mock;
    submitSigned: jest.Mock;
    findOne: jest.Mock;
  };
  let stellarService: {
    getAccountTrustlines: jest.Mock;
    buildTrustlineTransaction: jest.Mock;
    submitTransaction: jest.Mock;
  };
  let controller: PaymentsController;

  beforeEach(() => {
    paymentsService = {
      initiate: jest.fn(),
      submitSigned: jest.fn(),
      findOne: jest.fn(),
    };
    stellarService = {
      getAccountTrustlines: jest.fn(),
      buildTrustlineTransaction: jest.fn(),
      submitTransaction: jest.fn(),
    };
    controller = new PaymentsController(
      paymentsService as any,
      stellarService as any,
    );
  });

  describe('getTrustlines', () => {
    it('rejects a malformed public key without calling StellarService', async () => {
      await expect(controller.getTrustlines('not-a-key')).rejects.toThrow(
        MalformedPaymentRequestError,
      );
      expect(stellarService.getAccountTrustlines).not.toHaveBeenCalled();
    });

    it('delegates a valid public key to StellarService', async () => {
      stellarService.getAccountTrustlines.mockResolvedValueOnce({
        funded: true,
        balances: [],
      });

      const result = await controller.getTrustlines(validKey);

      expect(stellarService.getAccountTrustlines).toHaveBeenCalledWith(
        validKey,
      );
      expect(result).toEqual({ funded: true, balances: [] });
    });
  });

  describe('buildTrustline', () => {
    const issuer = Keypair.random().publicKey();

    it('rejects a malformed sourceAccount without calling StellarService', async () => {
      await expect(
        controller.buildTrustline({
          sourceAccount: 'not-a-key',
          assetCode: 'USDC',
          assetIssuer: issuer,
        } as any),
      ).rejects.toThrow(MalformedPaymentRequestError);
      expect(stellarService.buildTrustlineTransaction).not.toHaveBeenCalled();
    });

    it('rejects a malformed assetIssuer without calling StellarService', async () => {
      await expect(
        controller.buildTrustline({
          sourceAccount: validKey,
          assetCode: 'USDC',
          assetIssuer: 'not-a-key',
        } as any),
      ).rejects.toThrow(MalformedPaymentRequestError);
      expect(stellarService.buildTrustlineTransaction).not.toHaveBeenCalled();
    });

    it('builds and returns the unsigned XDR for valid input', async () => {
      stellarService.buildTrustlineTransaction.mockResolvedValueOnce(
        'fake-xdr',
      );

      const result = await controller.buildTrustline({
        sourceAccount: validKey,
        assetCode: 'USDC',
        assetIssuer: issuer,
      } as any);

      expect(result).toEqual({ unsignedTransactionXdr: 'fake-xdr' });
    });
  });

  describe('submitTrustline', () => {
    it('submits via StellarService and returns the outcome', async () => {
      stellarService.submitTransaction.mockResolvedValueOnce({
        successful: true,
        hash: 'fake-hash',
      });

      const result = await controller.submitTrustline({
        signedTransactionXdr: 'signed-xdr',
      });

      expect(stellarService.submitTransaction).toHaveBeenCalledWith(
        'signed-xdr',
      );
      expect(result).toEqual({ successful: true, hash: 'fake-hash' });
    });

    it('maps a Horizon rejection to a structured PaymentError', async () => {
      stellarService.submitTransaction.mockRejectedValueOnce(
        new Error('unexpected horizon failure'),
      );

      await expect(
        controller.submitTrustline({ signedTransactionXdr: 'signed-xdr' }),
      ).rejects.toMatchObject({ code: 'SUBMISSION_FAILED' });
    });
  });
});
