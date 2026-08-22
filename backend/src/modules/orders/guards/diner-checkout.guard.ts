// backend/src/modules/orders/guards/diner-checkout.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { CheckoutTokenService } from '../checkout-token.service';

export interface CheckoutContext {
  orderId: string;
  restaurantId: string;
}

export interface CheckoutRequest extends Request {
  checkoutContext: CheckoutContext;
}

/**
 * Verifies the diner checkout token decided in ADR 0002 and attaches
 * `{ orderId, restaurantId }` to the request. Routes using this guard must
 * also be marked `@Public()` to bypass the global staff JwtAuthGuard —
 * this guard is the diner-facing replacement for it, not an addition on
 * top of it.
 */
@Injectable()
export class DinerCheckoutGuard implements CanActivate {
  constructor(private readonly checkoutTokenService: CheckoutTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<CheckoutRequest>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing checkout token');
    }

    const payload = this.checkoutTokenService.verify(token);
    request.checkoutContext = {
      orderId: payload.orderId,
      restaurantId: payload.restaurantId,
    };
    return true;
  }

  private extractToken(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
