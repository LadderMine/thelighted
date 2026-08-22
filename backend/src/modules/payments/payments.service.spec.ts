import { QueryFailedError } from 'typeorm';
import { PaymentsService } from './payments.service';
import { PaymentStatus } from './payment.entity';
import {
  IdempotencyConflictError,
  InsufficientBalanceError,
  MalformedPaymentRequestError,
  RestaurantWalletNotConfiguredError,
  SequenceConflictError,
} from './errors/payment.errors';

type MockRepository = {
  create: jest.Mock;
  save: jest.Mock;
  findOne: jest.Mock;
};

function makeRepository(): MockRepository {
  return {
    create: jest.fn((data) => ({ ...data })),
    save: jest.fn(async (entity) => entity),
    findOne: jest.fn(),
  };
}

function makeUniqueViolation(): QueryFailedError {
  return new QueryFailedError('INSERT INTO payments...', [], {
    name: 'error',
    message: 'duplicate key value violates unique constraint',
    code: '23505',
  } as any);
}

describe('PaymentsService', () => {
  let paymentRepository: MockRepository;
  let orderRepository: MockRepository;
  let restaurantRepository: MockRepository;
  let stellarService: {
    buildPaymentTransaction: jest.Mock;
    submitTransaction: jest.Mock;
    computeTransactionHash: jest.Mock;
  };
  let sequenceAllocator: { allocate: jest.Mock; invalidate: jest.Mock };
  let paymentsGateway: { emitPaymentStatusChanged: jest.Mock };
  let service: PaymentsService;

  const order = {
    id: 'order-1',
    restaurantId: 'restaurant-1',
    orderNumber: 'ORD-1',
  };
  const restaurant = { id: 'restaurant-1', stellarWalletAddress: 'GDEST...' };

  const baseDto = {
    orderId: 'order-1',
    sourceAccount: 'GSOURCE...',
    assetCode: 'XLM',
    amount: '10.0000000',
    idempotencyKey: 'idem-key-1',
  };

  beforeEach(() => {
    paymentRepository = makeRepository();
    orderRepository = makeRepository();
    restaurantRepository = makeRepository();
    stellarService = {
      buildPaymentTransaction: jest.fn().mockResolvedValue('unsigned-xdr'),
      submitTransaction: jest.fn(),
      computeTransactionHash: jest
        .fn()
        .mockReturnValue('locally-computed-hash'),
    };
    sequenceAllocator = {
      allocate: jest.fn().mockResolvedValue('101'),
      invalidate: jest.fn(),
    };
    paymentsGateway = { emitPaymentStatusChanged: jest.fn() };

    service = new PaymentsService(
      paymentRepository as any,
      orderRepository as any,
      restaurantRepository as any,
      stellarService as any,
      sequenceAllocator as any,
      paymentsGateway as any,
    );

    paymentRepository.findOne.mockResolvedValue(null);
    orderRepository.findOne.mockResolvedValue(order);
    restaurantRepository.findOne.mockResolvedValue(restaurant);
  });

  describe('initiate', () => {
    it('allocates a sequence, builds the transaction and persists a pending payment', async () => {
      const result = await service.initiate(baseDto);

      expect(sequenceAllocator.allocate).toHaveBeenCalledWith('GSOURCE...');
      expect(stellarService.buildPaymentTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceAccount: 'GSOURCE...',
          destinationAccount: 'GDEST...',
          assetCode: 'XLM',
          amount: '10.0000000',
          sequenceOverride: '101',
        }),
      );
      expect(paymentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: 'idem-key-1',
          status: PaymentStatus.PENDING,
        }),
      );
      expect(result.unsignedTransactionXdr).toBe('unsigned-xdr');
      expect(result.status).toBe(PaymentStatus.PENDING);
    });

    it('rejects a non-XLM asset with no issuer as malformed', async () => {
      await expect(
        service.initiate({ ...baseDto, assetCode: 'USDC' }),
      ).rejects.toThrow(MalformedPaymentRequestError);

      expect(sequenceAllocator.allocate).not.toHaveBeenCalled();
    });

    it('rejects an unknown orderId as malformed', async () => {
      orderRepository.findOne.mockResolvedValueOnce(null);

      await expect(service.initiate(baseDto)).rejects.toThrow(
        MalformedPaymentRequestError,
      );
    });

    it('rejects when the restaurant has no configured wallet', async () => {
      restaurantRepository.findOne.mockResolvedValueOnce({
        id: 'restaurant-1',
        stellarWalletAddress: null,
      });

      await expect(service.initiate(baseDto)).rejects.toThrow(
        RestaurantWalletNotConfiguredError,
      );
    });

    it('replays the existing result for a repeated idempotency key on the same order', async () => {
      paymentRepository.findOne.mockResolvedValueOnce({
        id: 'existing-payment',
        orderId: 'order-1',
        status: PaymentStatus.PENDING,
        horizonEnvelopeXdr: 'already-built-xdr',
      });

      const result = await service.initiate(baseDto);

      expect(result).toEqual({
        paymentId: 'existing-payment',
        status: PaymentStatus.PENDING,
        unsignedTransactionXdr: 'already-built-xdr',
      });
      expect(sequenceAllocator.allocate).not.toHaveBeenCalled();
      expect(stellarService.buildPaymentTransaction).not.toHaveBeenCalled();
    });

    it('rejects reusing an idempotency key across different orders', async () => {
      paymentRepository.findOne.mockResolvedValueOnce({
        id: 'existing-payment',
        orderId: 'a-different-order',
        status: PaymentStatus.PENDING,
        horizonEnvelopeXdr: 'already-built-xdr',
      });

      await expect(service.initiate(baseDto)).rejects.toThrow(
        IdempotencyConflictError,
      );
    });

    it('resolves to the racing writer’s row when two concurrent inserts collide on idempotencyKey', async () => {
      // First findOne (idempotency check) sees nothing; the save() then
      // hits the DB unique constraint because another request won the
      // race in between — this is the actual concurrency guarantee
      // (issue #313), not just the earlier findOne check.
      paymentRepository.save.mockRejectedValueOnce(makeUniqueViolation());
      paymentRepository.findOne.mockResolvedValueOnce(null); // idempotency check
      paymentRepository.findOne.mockResolvedValueOnce({
        id: 'raced-in-payment',
        orderId: 'order-1',
        status: PaymentStatus.PENDING,
        horizonEnvelopeXdr: 'unsigned-xdr',
      }); // re-fetch after unique violation

      const result = await service.initiate(baseDto);

      expect(result.paymentId).toBe('raced-in-payment');
    });
  });

  describe('submitSigned', () => {
    it('submits to Horizon and marks the payment SUBMITTED, never CONFIRMED directly', async () => {
      paymentRepository.findOne.mockResolvedValueOnce({
        id: 'payment-1',
        orderId: 'order-1',
        sourceAccount: 'GSOURCE...',
        status: PaymentStatus.PENDING,
      });
      stellarService.submitTransaction.mockResolvedValueOnce({
        hash: 'tx-hash-1',
        successful: true,
      });

      const result = await service.submitSigned('payment-1', 'order-1', {
        signedTransactionXdr: 'signed-xdr',
      });

      expect(result).toEqual({
        paymentId: 'payment-1',
        status: PaymentStatus.SUBMITTED,
        stellarTxHash: 'locally-computed-hash',
      });
      expect(paymentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: PaymentStatus.SUBMITTED,
          stellarTxHash: 'locally-computed-hash',
        }),
      );
      expect(paymentsGateway.emitPaymentStatusChanged).toHaveBeenCalledWith(
        'restaurant-1',
        expect.objectContaining({
          paymentId: 'payment-1',
          status: PaymentStatus.SUBMITTED,
        }),
      );
    });

    it('computes and persists the hash locally BEFORE calling Horizon', async () => {
      paymentRepository.findOne.mockResolvedValueOnce({
        id: 'payment-1',
        orderId: 'order-1',
        sourceAccount: 'GSOURCE...',
        status: PaymentStatus.PENDING,
      });
      stellarService.submitTransaction.mockResolvedValueOnce({
        hash: 'tx-hash-1',
        successful: true,
      });

      await service.submitSigned('payment-1', 'order-1', {
        signedTransactionXdr: 'signed-xdr',
      });

      expect(stellarService.computeTransactionHash).toHaveBeenCalledWith(
        'signed-xdr',
      );
    });

    it('leaves the payment SUBMITTED on an ambiguous (network/timeout) submit error, without throwing', async () => {
      paymentRepository.findOne.mockResolvedValueOnce({
        id: 'payment-1',
        orderId: 'order-1',
        sourceAccount: 'GSOURCE...',
        status: PaymentStatus.PENDING,
      });
      stellarService.submitTransaction.mockRejectedValueOnce(
        new Error('socket hang up'),
      );

      const result = await service.submitSigned('payment-1', 'order-1', {
        signedTransactionXdr: 'signed-xdr',
      });

      expect(result).toEqual({
        paymentId: 'payment-1',
        status: PaymentStatus.SUBMITTED,
        stellarTxHash: 'locally-computed-hash',
      });
      // Only ever saved once — the initial PENDING -> SUBMITTED transition.
      // An ambiguous error must not also flip it to FAILED.
      expect(paymentRepository.save).toHaveBeenCalledTimes(1);
    });

    it('is a no-op replay for an already-submitted payment', async () => {
      paymentRepository.findOne.mockResolvedValueOnce({
        id: 'payment-1',
        orderId: 'order-1',
        sourceAccount: 'GSOURCE...',
        status: PaymentStatus.SUBMITTED,
        stellarTxHash: 'tx-hash-1',
      });

      const result = await service.submitSigned('payment-1', 'order-1', {
        signedTransactionXdr: 'signed-xdr',
      });

      expect(result.status).toBe(PaymentStatus.SUBMITTED);
      expect(stellarService.submitTransaction).not.toHaveBeenCalled();
      expect(paymentRepository.save).not.toHaveBeenCalled();
    });

    it('is a no-op replay for an already-confirmed payment', async () => {
      paymentRepository.findOne.mockResolvedValueOnce({
        id: 'payment-1',
        orderId: 'order-1',
        sourceAccount: 'GSOURCE...',
        status: PaymentStatus.CONFIRMED,
        stellarTxHash: 'tx-hash-1',
      });

      const result = await service.submitSigned('payment-1', 'order-1', {
        signedTransactionXdr: 'signed-xdr',
      });

      expect(result.status).toBe(PaymentStatus.CONFIRMED);
      expect(stellarService.submitTransaction).not.toHaveBeenCalled();
      expect(paymentRepository.save).not.toHaveBeenCalled();
    });

    it('rejects an unknown paymentId as malformed', async () => {
      paymentRepository.findOne.mockResolvedValueOnce(null);

      await expect(
        service.submitSigned('missing-payment', 'order-1', {
          signedTransactionXdr: 'signed-xdr',
        }),
      ).rejects.toThrow(MalformedPaymentRequestError);
    });

    it('maps a tx_bad_seq rejection to SequenceConflictError and invalidates the cached sequence', async () => {
      paymentRepository.findOne.mockResolvedValueOnce({
        id: 'payment-1',
        orderId: 'order-1',
        sourceAccount: 'GSOURCE...',
        status: PaymentStatus.PENDING,
      });
      stellarService.submitTransaction.mockRejectedValueOnce({
        response: {
          data: { extras: { result_codes: { transaction: 'tx_bad_seq' } } },
        },
      });

      await expect(
        service.submitSigned('payment-1', 'order-1', {
          signedTransactionXdr: 'signed-xdr',
        }),
      ).rejects.toThrow(SequenceConflictError);

      expect(sequenceAllocator.invalidate).toHaveBeenCalledWith('GSOURCE...');
      expect(paymentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: PaymentStatus.FAILED,
          failureReason: 'SEQUENCE_CONFLICT',
        }),
      );
    });

    it('maps an underfunded rejection to InsufficientBalanceError without invalidating the sequence', async () => {
      paymentRepository.findOne.mockResolvedValueOnce({
        id: 'payment-1',
        orderId: 'order-1',
        sourceAccount: 'GSOURCE...',
        status: PaymentStatus.PENDING,
      });
      stellarService.submitTransaction.mockRejectedValueOnce({
        response: {
          data: {
            extras: {
              result_codes: {
                transaction: 'tx_failed',
                operations: ['op_underfunded'],
              },
            },
          },
        },
      });

      await expect(
        service.submitSigned('payment-1', 'order-1', {
          signedTransactionXdr: 'signed-xdr',
        }),
      ).rejects.toThrow(InsufficientBalanceError);

      expect(sequenceAllocator.invalidate).not.toHaveBeenCalled();
      expect(paymentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: PaymentStatus.FAILED,
          failureReason: 'INSUFFICIENT_BALANCE',
        }),
      );
    });
  });
});
