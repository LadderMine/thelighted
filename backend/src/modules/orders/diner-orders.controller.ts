// backend/src/modules/orders/diner-orders.controller.ts
import { Controller, Get, Param, Request, UseGuards } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { MalformedPaymentRequestError } from '../payments/errors/payment.errors';
import {
  CheckoutRequest,
  DinerCheckoutGuard,
} from './guards/diner-checkout.guard';
import { OrdersService } from './orders.service';

// Diner-facing counterpart to OrdersController, which is entirely
// staff-gated (class-level JwtAuthGuard). A diner arriving via a scanned
// QR code (ADR 0002) has a checkout token, not a staff session, and needs
// enough of their own order — items and total — to render the checkout UI
// (issue #315) without the frontend inventing or mocking that data.
@Controller('orders')
@Public()
@UseGuards(DinerCheckoutGuard)
export class DinerOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get(':orderId/checkout-summary')
  async getCheckoutSummary(
    @Request() req: CheckoutRequest,
    @Param('orderId') orderId: string,
  ) {
    if (req.checkoutContext.orderId !== orderId) {
      throw new MalformedPaymentRequestError({
        reason: 'orderId does not match checkout token',
      });
    }

    const order = await this.ordersService.findOne(
      orderId,
      req.checkoutContext.restaurantId,
    );

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      items: order.items,
      // TypeORM returns `decimal` columns as strings to avoid precision
      // loss — OrdersController.create() already does this same coercion
      // when returning `total` to a client.
      total: Number(order.total),
      currency: order.currency,
      status: order.status,
    };
  }
}
