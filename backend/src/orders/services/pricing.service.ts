import { Injectable } from '@nestjs/common';
import { OrderType } from 'src/common/enums/orderType.enum';

@Injectable()
export class PricingService {
  calculate(
    subtotal: number,
    orderType: OrderType,
    payWithCrypto = false,
  ) {
    const taxAmount = subtotal * 0.075;
    const serviceFee = 1.5;
    const deliveryFee = orderType === OrderType.DELIVERY ? 5 : 0;
    const cryptoDiscount = payWithCrypto ? subtotal * 0.02 : 0;

    const total =
      subtotal +
      taxAmount +
      serviceFee +
      deliveryFee -
      cryptoDiscount;

    return {
      subtotal,
      taxAmount: Number(taxAmount.toFixed(2)),
      serviceFee,
      deliveryFee,
      cryptoDiscount: Number(cryptoDiscount.toFixed(2)),
      total: Number(total.toFixed(2)),
    };
  }
}
