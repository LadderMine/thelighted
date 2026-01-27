import { IsEnum, IsOptional, IsString } from 'class-validator';
import { OrderStatus } from 'src/common/enums/orderStatus.enun';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @IsOptional()
  @IsString()
  note?: string;
}
