// backend/src/modules/payments/payments.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import {
  DinerCheckoutGuard,
  CheckoutRequest,
} from '../orders/guards/diner-checkout.guard';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { SubmitSignedPaymentDto } from './dto/submit-signed-payment.dto';
import { PaymentsService } from './payments.service';
import { MalformedPaymentRequestError } from './errors/payment.errors';

// Diner-facing, not staff-facing (see ADR 0002) — @Public() bypasses the
// global staff JwtAuthGuard, and DinerCheckoutGuard is the real gate here.
@Controller('payments/stellar')
@Public()
@UseGuards(DinerCheckoutGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // Throttled tighter than the app default — a diner initiates a payment
  // once per checkout, not in a tight loop; this bounds abuse of an
  // otherwise-expensive (Horizon round trip) endpoint.
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('initiate')
  async initiate(
    @Request() req: CheckoutRequest,
    @Body() dto: InitiatePaymentDto,
  ) {
    this.assertMatchesCheckoutOrder(req, dto.orderId);
    return this.paymentsService.initiate(dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post(':paymentId/submit-signed')
  async submitSigned(
    @Request() req: CheckoutRequest,
    @Param('paymentId') paymentId: string,
    @Body() dto: SubmitSignedPaymentDto,
  ) {
    return this.paymentsService.submitSigned(
      paymentId,
      req.checkoutContext.orderId,
      dto,
    );
  }

  // Reconnect-safe status fetch (issue #314 edge case): a client that
  // disconnects from the payments WebSocket before the confirmation event
  // arrives must be able to fetch current status directly instead of
  // relying solely on the push event.
  @Get(':paymentId')
  async findOne(
    @Request() req: CheckoutRequest,
    @Param('paymentId') paymentId: string,
  ) {
    return this.paymentsService.findOne(paymentId, req.checkoutContext.orderId);
  }

  // A valid checkout token only ever authorizes the order it was issued
  // for (ADR 0002) — this stops a token for order A being replayed against
  // a payment request naming order B.
  private assertMatchesCheckoutOrder(
    req: CheckoutRequest,
    orderId: string,
  ): void {
    if (req.checkoutContext.orderId !== orderId) {
      throw new MalformedPaymentRequestError({
        reason: 'orderId does not match checkout token',
      });
    }
  }
}
