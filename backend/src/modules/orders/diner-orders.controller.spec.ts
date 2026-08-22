import { DinerOrdersController } from './diner-orders.controller';
import { MalformedPaymentRequestError } from '../payments/errors/payment.errors';
import type { CheckoutRequest } from './guards/diner-checkout.guard';

function makeRequest(orderId: string, restaurantId: string): CheckoutRequest {
  return { checkoutContext: { orderId, restaurantId } } as CheckoutRequest;
}

describe('DinerOrdersController', () => {
  let ordersService: { findOne: jest.Mock };
  let controller: DinerOrdersController;

  beforeEach(() => {
    ordersService = { findOne: jest.fn() };
    controller = new DinerOrdersController(ordersService as any);
  });

  it('rejects a path orderId that does not match the checkout token', async () => {
    const req = makeRequest('order-1', 'restaurant-1');

    await expect(
      controller.getCheckoutSummary(req, 'a-different-order'),
    ).rejects.toThrow(MalformedPaymentRequestError);
    expect(ordersService.findOne).not.toHaveBeenCalled();
  });

  it('returns a diner-safe summary scoped to the checkout token', async () => {
    const req = makeRequest('order-1', 'restaurant-1');
    ordersService.findOne.mockResolvedValueOnce({
      id: 'order-1',
      orderNumber: 'ORD-1',
      items: [{ name: 'Jollof Rice', quantity: 2, price: 12 }],
      total: 24,
      currency: 'XLM',
      status: 'pending',
    });

    const result = await controller.getCheckoutSummary(req, 'order-1');

    expect(ordersService.findOne).toHaveBeenCalledWith(
      'order-1',
      'restaurant-1',
    );
    expect(result).toEqual({
      orderId: 'order-1',
      orderNumber: 'ORD-1',
      items: [{ name: 'Jollof Rice', quantity: 2, price: 12 }],
      total: 24,
      currency: 'XLM',
      status: 'pending',
    });
  });

  it('coerces a decimal total returned as a string (TypeORM decimal columns) to a number', async () => {
    const req = makeRequest('order-1', 'restaurant-1');
    ordersService.findOne.mockResolvedValueOnce({
      id: 'order-1',
      orderNumber: 'ORD-1',
      items: [],
      total: '24.00',
      currency: 'XLM',
      status: 'pending',
    });

    const result = await controller.getCheckoutSummary(req, 'order-1');

    expect(result.total).toBe(24);
    expect(typeof result.total).toBe('number');
  });
});
