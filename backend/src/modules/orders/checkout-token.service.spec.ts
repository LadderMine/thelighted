import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CheckoutTokenService } from './checkout-token.service';

function makeConfigService(values: Record<string, number> = {}) {
  return {
    get: jest.fn((key: string, fallback?: number) => values[key] ?? fallback),
  };
}

describe('CheckoutTokenService', () => {
  const jwtService = new JwtService({ secret: 'test-secret' });

  it('issues a token carrying the diner checkout payload', () => {
    const service = new CheckoutTokenService(
      jwtService,
      makeConfigService() as any,
    );

    const { token, expiresIn } = service.issue('order-1', 'restaurant-1');

    expect(typeof token).toBe('string');
    expect(expiresIn).toBe(900);

    const payload = service.verify(token);
    expect(payload).toEqual(
      expect.objectContaining({
        sub: 'diner',
        type: 'checkout',
        orderId: 'order-1',
        restaurantId: 'restaurant-1',
      }),
    );
  });

  it('honors a configured TTL override', () => {
    const service = new CheckoutTokenService(
      jwtService,
      makeConfigService({ CHECKOUT_TOKEN_TTL_SECONDS: 60 }) as any,
    );

    const { expiresIn } = service.issue('order-1', 'restaurant-1');

    expect(expiresIn).toBe(60);
  });

  it('rejects a token signed with a different secret', () => {
    const service = new CheckoutTokenService(
      jwtService,
      makeConfigService() as any,
    );
    const otherJwtService = new JwtService({ secret: 'a-different-secret' });
    const foreignToken = otherJwtService.sign({
      sub: 'diner',
      type: 'checkout',
      orderId: 'order-1',
      restaurantId: 'restaurant-1',
    });

    expect(() => service.verify(foreignToken)).toThrow(UnauthorizedException);
  });

  it('rejects a well-formed staff-style JWT (wrong sub/type)', () => {
    const service = new CheckoutTokenService(
      jwtService,
      makeConfigService() as any,
    );
    const staffToken = jwtService.sign({ sub: 'staff-user', role: 'admin' });

    expect(() => service.verify(staffToken)).toThrow(UnauthorizedException);
  });

  it('rejects an expired token', () => {
    const service = new CheckoutTokenService(
      jwtService,
      makeConfigService({ CHECKOUT_TOKEN_TTL_SECONDS: -1 }) as any,
    );

    const { token } = service.issue('order-1', 'restaurant-1');

    expect(() => service.verify(token)).toThrow(UnauthorizedException);
  });
});
