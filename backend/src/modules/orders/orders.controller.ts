// backend/src/modules/orders/orders.controller.ts
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateOrderNotificationDto } from './dto/create-order-notification.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersGateway } from './orders.gateway';
import { OrdersService } from './orders.service';
import { CheckoutTokenService } from './checkout-token.service';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(
    private readonly ordersGateway: OrdersGateway,
    private readonly ordersService: OrdersService,
    private readonly checkoutTokenService: CheckoutTokenService,
  ) {}

  // Staff-gated (class-level JwtAuthGuard) issuance of the diner-facing
  // checkout token — see ADR 0002. A staff member/POS system calls this when
  // seating a table or generating that table's QR code; the token is what
  // then lets the diner's own device call the payments endpoints for this
  // one order without a staff session.
  @Get(':orderId/checkout-token')
  @HttpCode(HttpStatus.OK)
  async getCheckoutToken(@Request() req, @Param('orderId') orderId: string) {
    const order = await this.ordersService.findOne(
      orderId,
      req.user.restaurantId,
    );

    return this.checkoutTokenService.issue(order.id, order.restaurantId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Request() req, @Body() dto: CreateOrderNotificationDto) {
    const saved = await this.ordersService.create(req.user.restaurantId, dto);

    const order = {
      orderId: saved.id,
      orderNumber: saved.orderNumber,
      status: saved.status,
      total: Number(saved.total),
      createdAt: saved.createdAt.toISOString(),
    };

    this.ordersGateway.emitNewOrder(req.user.restaurantId, order);

    return order;
  }

  @Patch(':orderId/status')
  @HttpCode(HttpStatus.OK)
  async updateStatus(
    @Request() req,
    @Param('orderId') orderId: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    const saved = await this.ordersService.updateStatus(
      orderId,
      req.user.restaurantId,
      dto,
    );

    const event = {
      orderId: saved.id,
      orderNumber: dto.orderNumber ?? saved.orderNumber,
      status: saved.status,
      updatedAt: saved.updatedAt.toISOString(),
    };

    this.ordersGateway.emitOrderStatusChanged(req.user.restaurantId, event);

    return event;
  }
}
