import { Logger } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { Keypair, NotFoundError } from '@stellar/stellar-sdk';
import { LoyaltyPayoutService } from './loyalty-payout.service';
import { LoyaltyPayoutStatus } from './loyalty-payout.entity';
import { Payment } from './payment.entity';

type MockRepository = {
  create: jest.Mock;
  save: jest.Mock;
  findOne: jest.Mock;
  find: jest.Mock;
};

function makeRepository(): MockRepository {
  return {
    create: jest.fn((data) => ({ ...data })),
    save: jest.fn(async (entity) => entity),
    findOne: jest.fn(),
    find: jest.fn(),
  };
}

function makeUniqueViolation(): QueryFailedError {
  return new QueryFailedError('INSERT INTO loyalty_payouts...', [], {
    name: 'error',
    message: 'duplicate key value violates unique constraint',
    code: '23505',
  } as any);
}

const issuerKeypair = Keypair.random();
const dinerKeypair = Keypair.random();

function makeConfig(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    LOYALTY_ISSUER_SECRET: issuerKeypair.secret(),
    LOYALTY_ASSET_CODE: 'BITE',
    LOYALTY_RATE_BPS: '1000',
    ...overrides,
  };
  return { get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback) };
}

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'payment-1',
    orderId: 'order-1',
    sourceAccount: dinerKeypair.publicKey(),
    destinationAccount: 'GDEST...',
    asset: 'XLM',
    amount: 10,
    status: 'confirmed' as any,
    stellarTxHash: 'tx-hash-1',
    ...overrides,
  } as Payment;
}

function makePayout(overrides: Partial<any> = {}) {
  return {
    id: 'payout-1',
    paymentId: 'payment-1',
    orderId: 'order-1',
    destinationAccount: dinerKeypair.publicKey(),
    assetCode: 'BITE',
    assetIssuer: issuerKeypair.publicKey(),
    amount: 1,
    status: LoyaltyPayoutStatus.PENDING,
    stellarTxHash: null,
    failureReason: null,
    attemptCount: 0,
    lastAttemptAt: null,
    confirmedAt: null,
    ...overrides,
  };
}

describe('LoyaltyPayoutService (issue #316 / ADR 0004)', () => {
  let payoutRepository: MockRepository;
  let orderRepository: MockRepository;
  let stellarService: {
    buildPaymentTransaction: jest.Mock;
    signTransactionWithKeypair: jest.Mock;
    computeTransactionHash: jest.Mock;
    submitTransaction: jest.Mock;
    fetchTransaction: jest.Mock;
  };
  let sequenceAllocator: { allocate: jest.Mock; invalidate: jest.Mock };
  let paymentsGateway: { emitLoyaltyPayoutStatusChanged: jest.Mock };
  let service: LoyaltyPayoutService;

  beforeEach(() => {
    payoutRepository = makeRepository();
    orderRepository = makeRepository();
    orderRepository.findOne.mockResolvedValue({
      id: 'order-1',
      restaurantId: 'restaurant-1',
    });
    stellarService = {
      buildPaymentTransaction: jest.fn().mockResolvedValue('unsigned-xdr'),
      signTransactionWithKeypair: jest.fn().mockReturnValue('signed-xdr'),
      computeTransactionHash: jest.fn().mockReturnValue('computed-hash'),
      submitTransaction: jest.fn(),
      fetchTransaction: jest.fn(),
    };
    sequenceAllocator = {
      allocate: jest.fn().mockResolvedValue('101'),
      invalidate: jest.fn(),
    };
    paymentsGateway = { emitLoyaltyPayoutStatusChanged: jest.fn() };

    service = new LoyaltyPayoutService(
      payoutRepository as any,
      orderRepository as any,
      stellarService as any,
      sequenceAllocator as any,
      makeConfig() as any,
      paymentsGateway as any,
    );
    service.onModuleInit();
  });

  describe('onModuleInit — secret handling', () => {
    it('throws when LOYALTY_ISSUER_SECRET is missing', () => {
      const s = new LoyaltyPayoutService(
        payoutRepository as any,
        orderRepository as any,
        stellarService as any,
        sequenceAllocator as any,
        makeConfig({ LOYALTY_ISSUER_SECRET: undefined }) as any,
        paymentsGateway as any,
      );
      expect(() => s.onModuleInit()).toThrow(/LOYALTY_ISSUER_SECRET is not configured/);
    });

    it('throws a generic message for an invalid secret, never echoing the raw input', () => {
      const badSecret = 'SNOT-A-REAL-STELLAR-SECRET-KEY-AT-ALL-XYZ';
      const s = new LoyaltyPayoutService(
        payoutRepository as any,
        orderRepository as any,
        stellarService as any,
        sequenceAllocator as any,
        makeConfig({ LOYALTY_ISSUER_SECRET: badSecret }) as any,
        paymentsGateway as any,
      );

      let caught: Error | undefined;
      try {
        s.onModuleInit();
      } catch (e) {
        caught = e as Error;
      }

      expect(caught).toBeDefined();
      expect(caught!.message).toMatch(/not a valid Stellar secret key/);
      expect(caught!.message).not.toContain(badSecret);
    });

    it('never logs the secret anywhere, on success or failure', () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

      const secret = issuerKeypair.secret();
      const s = new LoyaltyPayoutService(
        payoutRepository as any,
        orderRepository as any,
        stellarService as any,
        sequenceAllocator as any,
        makeConfig({ LOYALTY_ISSUER_SECRET: secret }) as any,
        paymentsGateway as any,
      );
      s.onModuleInit();

      const allCalls = [...logSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls];
      for (const call of allCalls) {
        for (const arg of call) {
          expect(String(arg)).not.toContain(secret);
        }
      }

      logSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });

  describe('createForConfirmedPayment', () => {
    it('creates a PENDING payout for the README-documented 10% default rate', async () => {
      const payment = makePayment({ amount: 10 });

      await service.createForConfirmedPayment(payment);

      expect(payoutRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentId: 'payment-1',
          orderId: 'order-1',
          destinationAccount: dinerKeypair.publicKey(),
          assetCode: 'BITE',
          assetIssuer: issuerKeypair.publicKey(),
          amount: 1,
          status: LoyaltyPayoutStatus.PENDING,
        }),
      );
    });

    it('creates nothing when the computed loyalty amount is zero', async () => {
      const s = new LoyaltyPayoutService(
        payoutRepository as any,
        orderRepository as any,
        stellarService as any,
        sequenceAllocator as any,
        makeConfig({ LOYALTY_RATE_BPS: '0' }) as any,
        paymentsGateway as any,
      );
      s.onModuleInit();

      await s.createForConfirmedPayment(makePayment({ amount: 10 }));

      expect(payoutRepository.save).not.toHaveBeenCalled();
    });

    it('is idempotent: a duplicate paymentId (DB unique violation) is treated as already-created, not an error', async () => {
      payoutRepository.save.mockRejectedValueOnce(makeUniqueViolation());

      await expect(
        service.createForConfirmedPayment(makePayment()),
      ).resolves.toBeUndefined();
    });

    it('rethrows a save failure that is not the idempotency unique-violation', async () => {
      payoutRepository.save.mockRejectedValueOnce(new Error('connection reset'));

      await expect(
        service.createForConfirmedPayment(makePayment()),
      ).rejects.toThrow('connection reset');
    });
  });

  describe('processPending — submission', () => {
    it('builds, signs with the issuer key, computes the hash, and submits a PENDING payout', async () => {
      payoutRepository.find
        .mockResolvedValueOnce([makePayout()]) // PENDING batch
        .mockResolvedValueOnce([]) // FAILED batch
        .mockResolvedValueOnce([]); // SUBMITTED batch (confirm pass)
      stellarService.submitTransaction.mockResolvedValueOnce({
        hash: 'computed-hash',
        successful: true,
      });

      const summary = await service.processPending();

      expect(sequenceAllocator.allocate).toHaveBeenCalledWith(
        issuerKeypair.publicKey(),
      );
      expect(stellarService.buildPaymentTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceAccount: issuerKeypair.publicKey(),
          destinationAccount: dinerKeypair.publicKey(),
          assetCode: 'BITE',
          assetIssuer: issuerKeypair.publicKey(),
          amount: '1.0000000',
        }),
      );
      expect(stellarService.signTransactionWithKeypair).toHaveBeenCalledWith(
        'unsigned-xdr',
        expect.objectContaining({ publicKey: expect.any(Function) }),
      );
      expect(payoutRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: LoyaltyPayoutStatus.SUBMITTED,
          stellarTxHash: 'computed-hash',
          attemptCount: 1,
        }),
      );
      expect(summary.submitted).toBe(1);
    });

    it('marks a payout FAILED on a definitive Horizon rejection', async () => {
      payoutRepository.find
        .mockResolvedValueOnce([makePayout()])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      stellarService.submitTransaction.mockRejectedValueOnce({
        response: {
          data: {
            extras: {
              result_codes: { transaction: 'tx_failed', operations: ['op_no_destination'] },
            },
          },
        },
      });

      const summary = await service.processPending();

      expect(summary.failed).toBe(1);
      expect(payoutRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: LoyaltyPayoutStatus.FAILED,
          attemptCount: 2, // 1 for the SUBMITTED transition, 1 for FAILED
        }),
      );
    });

    it('leaves a payout SUBMITTED on an ambiguous submit error, not FAILED', async () => {
      payoutRepository.find
        .mockResolvedValueOnce([makePayout()])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      stellarService.submitTransaction.mockRejectedValueOnce(
        new Error('socket hang up'),
      );

      const summary = await service.processPending();

      expect(summary.submitted).toBe(1);
      expect(summary.failed).toBe(0);
      expect(payoutRepository.save).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: LoyaltyPayoutStatus.SUBMITTED }),
      );
    });

    it('does not retry a FAILED payout before its backoff window elapses', async () => {
      const recentlyFailed = makePayout({
        status: LoyaltyPayoutStatus.FAILED,
        attemptCount: 1,
        lastAttemptAt: new Date(),
      });
      payoutRepository.find
        .mockResolvedValueOnce([]) // PENDING
        .mockResolvedValueOnce([recentlyFailed]) // FAILED
        .mockResolvedValueOnce([]); // SUBMITTED

      await service.processPending();

      expect(stellarService.buildPaymentTransaction).not.toHaveBeenCalled();
    });

    it('records a second failure on a retried FAILED payout that fails again before reaching SUBMITTED, without crashing the batch', async () => {
      const longAgoFailed = makePayout({
        status: LoyaltyPayoutStatus.FAILED,
        attemptCount: 1,
        lastAttemptAt: new Date(Date.now() - 10 * 60 * 1000),
      });
      payoutRepository.find
        .mockResolvedValueOnce([]) // PENDING
        .mockResolvedValueOnce([longAgoFailed]) // FAILED, eligible
        .mockResolvedValueOnce([]); // SUBMITTED
      // Fails before ever reaching SUBMITTED — e.g. sequence allocation itself errors.
      sequenceAllocator.allocate.mockRejectedValueOnce(new Error('allocator unavailable'));

      const summary = await service.processPending();

      expect(summary.failed).toBe(1);
      expect(payoutRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: LoyaltyPayoutStatus.FAILED,
          attemptCount: 2,
          failureReason: 'allocator unavailable',
        }),
      );
    });

    it('retries a FAILED payout once its backoff window has elapsed, and it can then succeed — idempotent recovery (issue #316 acceptance criteria)', async () => {
      const longAgoFailed = makePayout({
        status: LoyaltyPayoutStatus.FAILED,
        attemptCount: 1,
        lastAttemptAt: new Date(Date.now() - 10 * 60 * 1000), // 10 min ago
      });
      payoutRepository.find
        .mockResolvedValueOnce([]) // PENDING
        .mockResolvedValueOnce([longAgoFailed]) // FAILED, eligible
        .mockResolvedValueOnce([]); // SUBMITTED
      stellarService.submitTransaction.mockResolvedValueOnce({
        hash: 'computed-hash',
        successful: true,
      });

      const summary = await service.processPending();

      expect(stellarService.buildPaymentTransaction).toHaveBeenCalledTimes(1);
      expect(summary.submitted).toBe(1);
      expect(payoutRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: LoyaltyPayoutStatus.SUBMITTED, attemptCount: 2 }),
      );
      // Still exactly the one payout row — retried, not duplicated.
      expect(payoutRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('processPending — confirmation', () => {
    it('confirms a SUBMITTED payout once Horizon reports it successful', async () => {
      const submittedPayout = makePayout({
        status: LoyaltyPayoutStatus.SUBMITTED,
        stellarTxHash: 'tx-hash-1',
      });
      payoutRepository.find
        .mockResolvedValueOnce([]) // PENDING
        .mockResolvedValueOnce([]) // FAILED
        .mockResolvedValueOnce([submittedPayout]); // SUBMITTED
      stellarService.fetchTransaction.mockResolvedValueOnce({
        hash: 'tx-hash-1',
        successful: true,
      });

      const summary = await service.processPending();

      expect(summary.confirmed).toBe(1);
      expect(payoutRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: LoyaltyPayoutStatus.CONFIRMED }),
      );
      expect(paymentsGateway.emitLoyaltyPayoutStatusChanged).toHaveBeenCalledWith(
        'restaurant-1',
        expect.objectContaining({
          payoutId: 'payout-1',
          status: LoyaltyPayoutStatus.CONFIRMED,
        }),
      );
    });

    it('leaves a SUBMITTED payout unresolved when Horizon has no record yet (propagation delay)', async () => {
      const submittedPayout = makePayout({
        status: LoyaltyPayoutStatus.SUBMITTED,
        stellarTxHash: 'tx-hash-1',
      });
      payoutRepository.find
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([submittedPayout]);
      stellarService.fetchTransaction.mockRejectedValueOnce(
        new NotFoundError('not found', {}),
      );

      const summary = await service.processPending();

      expect(summary.stillPending).toBe(1);
      expect(payoutRepository.save).not.toHaveBeenCalled();
    });

    it('marks a SUBMITTED payout FAILED when Horizon reports it unsuccessful', async () => {
      const submittedPayout = makePayout({
        status: LoyaltyPayoutStatus.SUBMITTED,
        stellarTxHash: 'tx-hash-1',
      });
      payoutRepository.find
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([submittedPayout]);
      stellarService.fetchTransaction.mockResolvedValueOnce({
        hash: 'tx-hash-1',
        successful: false,
      });

      const summary = await service.processPending();

      expect(summary.failed).toBe(1);
      expect(payoutRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: LoyaltyPayoutStatus.FAILED,
          failureReason: 'SUBMISSION_FAILED',
        }),
      );
    });
  });
});
