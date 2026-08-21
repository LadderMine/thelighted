// backend/src/modules/orders/dto/update-order-status.dto.ts
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { OrderStatus } from '../order.entity';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @IsString()
  @IsOptional()
  orderNumber?: string;
}
