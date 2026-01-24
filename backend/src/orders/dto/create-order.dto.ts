import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OrderType } from 'src/common/enums/orderType.enum';

export class OrderItemDto {
  @IsString()
  menuItemId: string;

  @IsNotEmpty()
  quantity: number;
}

export class CreateOrderDto {
  @IsString()
  restaurantId: string;

  @IsEnum(OrderType)
  orderType: OrderType;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @IsOptional()
  deliveryAddress?: any;

  @IsOptional()
  tableNumber?: string;
}
