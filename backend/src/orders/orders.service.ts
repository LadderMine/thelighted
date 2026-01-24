import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Order } from './entities/order.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { PricingService } from './services/pricing.service';
import { OrdersGateway } from '../websocket/orders.gateway';
import { OrderStatus } from 'src/common/enums/orderStatus.enun';

@Injectable()
export class OrdersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly pricingService: PricingService,
    private readonly gateway: OrdersGateway,
  ) {}

  async createOrder(userId: string, dto: CreateOrderDto) {
    if (!dto.items.length) {
      throw new BadRequestException('Order must contain items');
    }

    return this.dataSource.transaction(async (manager) => {
      const subtotal = dto.items.reduce(
        (sum, item) => sum + item.quantity * 10,
        0,
      );

      const pricing = this.pricingService.calculate(
        subtotal,
        dto.orderType,
      );

      const orderNumber = Date.now();

      const order = manager.create(Order, {
        customerId: userId,
        restaurantId: dto.restaurantId,
        orderType: dto.orderType,
        status: OrderStatus.PENDING,
        orderNumber,
        ...pricing,
        deliveryAddress: dto.deliveryAddress,
        tableNumber: dto.tableNumber,
      });

      await manager.save(order);

      this.gateway.emitToRestaurant(
        dto.restaurantId,
        'order:created',
        order,
      );

      return order;
    });
  }

  async cancelOrder(
  order: Order,
  userId: string,
  reason: string,
) {
  if (
    order.status === OrderStatus.COMPLETED ||
    order.status === OrderStatus.REFUNDED
  ) {
    throw new BadRequestException('Order cannot be cancelled');
  }

  order.status = OrderStatus.CANCELLED;
  order.cancelledAt = new Date();

  await this.dataSource.getRepository(Order).save(order);

  this.gateway.emitToRestaurant(
    order.restaurantId,
    'order:cancelled',
    order,
  );

  this.gateway.emitToUser(
    order.customerId,
    'order:cancelled',
    order,
  );

  return order;
}

}
