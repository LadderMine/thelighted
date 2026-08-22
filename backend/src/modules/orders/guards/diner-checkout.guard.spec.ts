import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { DinerCheckoutGuard } from './diner-checkout.guard';

function makeContext(headers: Record<string, string> = {}): {
  context: ExecutionContext;
  request: any;
} {
  const request: any = { headers };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('DinerCheckoutGuard', () => {
  it('throws UnauthorizedException when no Authorization header is present', () => {
    const checkoutTokenService = { verify: jest.fn() };
    const guard = new DinerCheckoutGuard(checkoutTokenService as any);
    const { context } = makeContext();

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(checkoutTokenService.verify).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when the header is not a Bearer token', () => {
    const checkoutTokenService = { verify: jest.fn() };
    const guard = new DinerCheckoutGuard(checkoutTokenService as any);
    const { context } = makeContext({ authorization: 'Basic abc123' });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('verifies the token and attaches checkoutContext to the request', () => {
    const checkoutTokenService = {
      verify: jest.fn().mockReturnValue({
        sub: 'diner',
        type: 'checkout',
        orderId: 'order-1',
        restaurantId: 'restaurant-1',
      }),
    };
    const guard = new DinerCheckoutGuard(checkoutTokenService as any);
    const { context, request } = makeContext({
      authorization: 'Bearer a-valid-token',
    });

    const result = guard.canActivate(context);

    expect(result).toBe(true);
    expect(checkoutTokenService.verify).toHaveBeenCalledWith('a-valid-token');
    expect(request.checkoutContext).toEqual({
      orderId: 'order-1',
      restaurantId: 'restaurant-1',
    });
  });

  it('propagates the underlying error when verification fails', () => {
    const checkoutTokenService = {
      verify: jest.fn().mockImplementation(() => {
        throw new UnauthorizedException('Invalid or expired checkout token');
      }),
    };
    const guard = new DinerCheckoutGuard(checkoutTokenService as any);
    const { context } = makeContext({ authorization: 'Bearer expired-token' });

    expect(() => guard.canActivate(context)).toThrow(
      /Invalid or expired checkout token/,
    );
  });
});
