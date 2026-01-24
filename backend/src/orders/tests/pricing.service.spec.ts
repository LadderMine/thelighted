import { OrderType } from 'src/common/enums/orderType.enum';
import { PricingService } from '../services/pricing.service';

describe('PricingService', () => {
  it('calculates delivery order correctly', () => {
    const service = new PricingService();
    const result = service.calculate(100, OrderType.DELIVERY);

    expect(result.total).toBeGreaterThan(100);
  });
});
