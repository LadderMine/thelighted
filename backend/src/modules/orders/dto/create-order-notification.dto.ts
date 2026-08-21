// backend/src/modules/orders/dto/create-order-notification.dto.ts
import { IsEnum, IsNumber, IsString, IsOptional, Min } from 'class-validator';
import { OrderStatus } from '../order.entity';

export class CreateOrderNotificationDto {
  @IsString()
  orderNumber: string;

  @IsNumber()
  @Min(0)
  total: number;

  @IsEnum(OrderStatus)
  @IsOptional()
  status?: OrderStatus;
}
