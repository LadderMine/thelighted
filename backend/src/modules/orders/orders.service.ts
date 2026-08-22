// backend/src/modules/orders/orders.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus } from './order.entity';
import { CreateOrderNotificationDto } from './dto/create-order-notification.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
  ) {}

  // The current notification-only DTO doesn't yet collect line items or a
  // settlement asset — the real order-creation flow (with a validated
  // cart/menu-item linkage) is a later issue in this batch. This persists
  // what's available today with sensible defaults for the rest, so the
  // Order table exists and later issues can extend it in place.
  async create(
    restaurantId: string,
    dto: CreateOrderNotificationDto,
  ): Promise<Order> {
    const order = this.orderRepository.create({
      orderNumber: dto.orderNumber,
      restaurantId,
      total: dto.total,
      status: dto.status ?? OrderStatus.PENDING,
      items: [],
      currency: 'XLM',
    });

    return this.orderRepository.save(order);
  }

  async findOne(orderId: string, restaurantId: string): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId, restaurantId },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    return order;
  }

  async updateStatus(
    orderId: string,
    restaurantId: string,
    dto: UpdateOrderStatusDto,
  ): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId, restaurantId },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    order.status = dto.status;
    return this.orderRepository.save(order);
  }
}
