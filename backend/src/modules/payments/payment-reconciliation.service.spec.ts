import { NotFoundError } from '@stellar/stellar-sdk';
import { PaymentReconciliationService } from './payment-reconciliation.service';
import { Payment, PaymentStatus } from './payment.entity';
import { OrderStatus } from '../orders/order.entity';

type MockRepository = {
  find: jest.Mock;
  findOne: jest.Mock;
  save: jest.Mock;
};

function makeRepository(): MockRepository {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(async (entity) => entity),
  };
}

function makePayment(overrides: Partial<Payment> = {}): Payment {
  const now = new Date();
  return {
    id: 'payment-1',
    orderId: 'order-1',
    sourceAccount: 'GSOURCE...',
    destinationAccount: 'GDEST...',
    asset: 'XLM',
    amount: 10,
    status: PaymentStatus.SUBMITTED,
    stellarTxHash: 'tx-hash-1',
    horizonEnvelopeXdr: 'envelope',
    confirmedAt: null,
    failureReason: null,
    expiresAt: new Date(now.getTime() + 60_000),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as Payment;
}

describe('PaymentReconciliationService', () => {
  let paymentRepository: MockRepository;
  let orderRepository: MockRepository;
  let stellarService: { fetchTransaction: jest.Mock };
  let paymentsGateway: { emitPaymentStatusChanged: jest.Mock };
  let loyaltyPayoutService: { createForConfirmedPayment: jest.Mock };
  let service: PaymentReconciliationService;

  beforeEach(() => {
    paymentRepository = makeRepository();
    orderRepository = makeRepository();
    stellarService = { fetchTransaction: jest.fn() };
    paymentsGateway = { emitPaymentStatusChanged: jest.fn() };
    loyaltyPayoutService = { createForConfirmedPayment: jest.fn() };

    orderRepository.findOne.mockResolvedValue({
      id: 'order-1',
      restaurantId: 'restaurant-1',
      status: OrderStatus.PENDING,
    });

    service = new PaymentReconciliationService(
      paymentRepository as any,
      orderRepository as any,
      stellarService as any,
      paymentsGateway as any,
      loyaltyPayoutService as any,
    );
  });

  describe('reconcile — resolving a SUBMITTED payment by hash', () => {
    it('confirms a payment once Horizon reports the transaction successful', async () => {
      const payment = makePayment();
      paymentRepository.find
        .mockResolvedValueOnce([payment]) // SUBMITTED batch
        .mockResolvedValueOnce([]); // expireStale batch
      stellarService.fetchTransaction.mockResolvedValueOnce({
        hash: 'tx-hash-1',
        successful: true,
      });

      const summary = await service.reconcile();

      expect(summary.confirmed).toBe(1);
      expect(paymentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: PaymentStatus.CONFIRMED }),
      );
      expect(paymentsGateway.emitPaymentStatusChanged).toHaveBeenCalledWith(
        'restaurant-1',
        expect.objectContaining({
          paymentId: 'payment-1',
          status: PaymentStatus.CONFIRMED,
        }),
      );
    });

    it('marks a payment FAILED when Horizon reports the on-ledger transaction unsuccessful', async () => {
      const payment = makePayment();
      paymentRepository.find
        .mockResolvedValueOnce([payment])
        .mockResolvedValueOnce([]);
      stellarService.fetchTransaction.mockResolvedValueOnce({
        hash: 'tx-hash-1',
        successful: false,
      });

      const summary = await service.reconcile();

      expect(summary.failed).toBe(1);
      expect(paymentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: PaymentStatus.FAILED }),
      );
    });

    it('leaves the payment SUBMITTED when Horizon has no record yet (propagation delay), not a failure', async () => {
      const payment = makePayment();
      paymentRepository.find
        .mockResolvedValueOnce([payment])
        .mockResolvedValueOnce([]);
      stellarService.fetchTransaction.mockRejectedValueOnce(
        new NotFoundError('not found', {}),
      );

      const summary = await service.reconcile();

      expect(summary.stillPending).toBe(1);
      expect(paymentRepository.save).not.toHaveBeenCalled();
      expect(paymentsGateway.emitPaymentStatusChanged).not.toHaveBeenCalled();
    });

    it('leaves the payment SUBMITTED on a transient (non-NotFound) Horizon error, retried next tick', async () => {
      const payment = makePayment();
      paymentRepository.find
        .mockResolvedValueOnce([payment])
        .mockResolvedValueOnce([]);
      stellarService.fetchTransaction.mockRejectedValueOnce(
        new Error('ECONNRESET'),
      );

      const summary = await service.reconcile();

      expect(summary.stillPending).toBe(1);
      expect(paymentRepository.save).not.toHaveBeenCalled();
    });

    it('is safe to run twice: a confirmed payment is not reprocessed on the next pass (idempotent)', async () => {
      const payment = makePayment();
      paymentRepository.find
        .mockResolvedValueOnce([payment])
        .mockResolvedValueOnce([]);
      stellarService.fetchTransaction.mockResolvedValueOnce({
        hash: 'tx-hash-1',
        successful: true,
      });

      await service.reconcile();

      // Second pass: the payment is no longer SUBMITTED, so the query for
      // SUBMITTED payments naturally excludes it — simulated here by
      // returning an empty batch, since paymentRepository is mocked.
      paymentRepository.find
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      const secondSummary = await service.reconcile();

      expect(secondSummary.confirmed).toBe(0);
      expect(stellarService.fetchTransaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('reconcile — order-paid flip and loyalty payout trigger (issue #316)', () => {
    it('flips the order from PENDING to CONFIRMED ("paid") once the payment confirms', async () => {
      const payment = makePayment();
      paymentRepository.find
        .mockResolvedValueOnce([payment])
        .mockResolvedValueOnce([]);
      stellarService.fetchTransaction.mockResolvedValueOnce({
        hash: 'tx-hash-1',
        successful: true,
      });

      await service.reconcile();

      expect(orderRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'order-1', status: OrderStatus.CONFIRMED }),
      );
    });

    it('does not touch an order the kitchen has already moved past PENDING (idempotent re-run safety)', async () => {
      orderRepository.findOne.mockResolvedValue({
        id: 'order-1',
        restaurantId: 'restaurant-1',
        status: OrderStatus.PREPARING,
      });
      const payment = makePayment();
      paymentRepository.find
        .mockResolvedValueOnce([payment])
        .mockResolvedValueOnce([]);
      stellarService.fetchTransaction.mockResolvedValueOnce({
        hash: 'tx-hash-1',
        successful: true,
      });

      await service.reconcile();

      expect(orderRepository.save).not.toHaveBeenCalled();
    });

    it('creates a loyalty payout when a payment confirms', async () => {
      const payment = makePayment();
      paymentRepository.find
        .mockResolvedValueOnce([payment])
        .mockResolvedValueOnce([]);
      stellarService.fetchTransaction.mockResolvedValueOnce({
        hash: 'tx-hash-1',
        successful: true,
      });

      await service.reconcile();

      expect(loyaltyPayoutService.createForConfirmedPayment).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'payment-1', status: PaymentStatus.CONFIRMED }),
      );
    });

    it('does not create a loyalty payout when a payment fails, only on confirmation', async () => {
      const payment = makePayment();
      paymentRepository.find
        .mockResolvedValueOnce([payment])
        .mockResolvedValueOnce([]);
      stellarService.fetchTransaction.mockResolvedValueOnce({
        hash: 'tx-hash-1',
        successful: false,
      });

      await service.reconcile();

      expect(loyaltyPayoutService.createForConfirmedPayment).not.toHaveBeenCalled();
      expect(orderRepository.save).not.toHaveBeenCalled();
    });

    it('does not let a loyalty payout creation failure roll back the already-saved CONFIRMED payment status', async () => {
      loyaltyPayoutService.createForConfirmedPayment.mockRejectedValueOnce(
        new Error('payout service unavailable'),
      );
      const payment = makePayment();
      paymentRepository.find
        .mockResolvedValueOnce([payment])
        .mockResolvedValueOnce([]);
      stellarService.fetchTransaction.mockResolvedValueOnce({
        hash: 'tx-hash-1',
        successful: true,
      });

      const summary = await service.reconcile();

      expect(summary.confirmed).toBe(1);
      expect(paymentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: PaymentStatus.CONFIRMED }),
      );
    });
  });

  describe('reconcile — expiry', () => {
    it('expires a SUBMITTED payment past its timebounds that Horizon still has no record of', async () => {
      const now = new Date();
      const payment = makePayment({
        expiresAt: new Date(now.getTime() - 1000),
      });
      paymentRepository.find
        .mockResolvedValueOnce([]) // no SUBMITTED-batch candidates (already past due, handled by expiry loop)
        .mockResolvedValueOnce([payment]); // expireStale batch
      stellarService.fetchTransaction.mockRejectedValueOnce(
        new NotFoundError('not found', {}),
      );

      const summary = await service.reconcile(now);

      expect(summary.expired).toBe(1);
      expect(paymentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: PaymentStatus.EXPIRED }),
      );
    });

    it('expires a PENDING payment past its timebounds (never even submitted)', async () => {
      const now = new Date();
      const payment = makePayment({
        status: PaymentStatus.PENDING,
        stellarTxHash: null,
        expiresAt: new Date(now.getTime() - 1000),
      });
      paymentRepository.find
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([payment]);

      const summary = await service.reconcile(now);

      expect(summary.expired).toBe(1);
      expect(stellarService.fetchTransaction).not.toHaveBeenCalled();
      expect(paymentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: PaymentStatus.EXPIRED }),
      );
    });

    it('does not expire a SUBMITTED payment that confirms in the same pass its deadline passed', async () => {
      const now = new Date();
      const payment = makePayment({
        expiresAt: new Date(now.getTime() - 1000),
      });
      paymentRepository.find
        .mockResolvedValueOnce([]) // not in the SUBMITTED batch (already past due-window handling below)
        .mockResolvedValueOnce([payment]); // picked up by expireStale instead
      stellarService.fetchTransaction.mockResolvedValueOnce({
        hash: 'tx-hash-1',
        successful: true,
      });

      const summary = await service.reconcile(now);

      expect(summary.confirmed).toBe(1);
      expect(summary.expired).toBe(0);
      expect(paymentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: PaymentStatus.CONFIRMED }),
      );
    });
  });
});
