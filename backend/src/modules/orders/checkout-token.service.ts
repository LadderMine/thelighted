// backend/src/modules/orders/checkout-token.service.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

const DEFAULT_TTL_SECONDS = 900; // 15 minutes

export interface CheckoutTokenPayload {
  sub: 'diner';
  type: 'checkout';
  orderId: string;
  restaurantId: string;
}

/**
 * Issues and verifies the short-lived, order-scoped diner checkout token
 * decided in ADR 0002 (docs/adr/0002-diner-checkout-authentication.md) —
 * distinct from the staff JWT (modules/auth), and only ever authorizes
 * acting on the one order it was issued for.
 */
@Injectable()
export class CheckoutTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  issue(
    orderId: string,
    restaurantId: string,
  ): { token: string; expiresIn: number } {
    const expiresIn = this.config.get<number>(
      'CHECKOUT_TOKEN_TTL_SECONDS',
      DEFAULT_TTL_SECONDS,
    );
    const payload: CheckoutTokenPayload = {
      sub: 'diner',
      type: 'checkout',
      orderId,
      restaurantId,
    };
    const token = this.jwtService.sign(payload, { expiresIn });
    return { token, expiresIn };
  }

  verify(token: string): CheckoutTokenPayload {
    let payload: CheckoutTokenPayload;
    try {
      payload = this.jwtService.verify<CheckoutTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired checkout token');
    }

    if (payload.type !== 'checkout' || payload.sub !== 'diner') {
      throw new UnauthorizedException('Not a valid checkout token');
    }
    return payload;
  }
}
