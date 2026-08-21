import { NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrderStatus } from './order.entity';

type MockRepository = {
  create: jest.Mock;
  save: jest.Mock;
  findOne: jest.Mock;
};

function makeRepository(): MockRepository {
  return {
    create: jest.fn((data) => ({ ...data })),
    save: jest.fn(async (entity) => ({
      id: entity.id ?? 'generated-id',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      ...entity,
    })),
    findOne: jest.fn(),
  };
}

describe('OrdersService', () => {
  let repository: MockRepository;
  let service: OrdersService;

  beforeEach(() => {
    repository = makeRepository();
    service = new OrdersService(repository as any);
  });

  describe('create', () => {
    it('persists the order with sensible defaults for fields the notification DTO does not collect yet', async () => {
      const order = await service.create('restaurant-1', {
        orderNumber: 'ORD-1',
        total: 42.5,
      });

      expect(repository.create).toHaveBeenCalledWith({
        orderNumber: 'ORD-1',
        restaurantId: 'restaurant-1',
        total: 42.5,
        status: OrderStatus.PENDING,
        items: [],
        currency: 'XLM',
      });
      expect(order.id).toBe('generated-id');
    });

    it('honors an explicit status when provided', async () => {
      const order = await service.create('restaurant-1', {
        orderNumber: 'ORD-2',
        total: 10,
        status: OrderStatus.CONFIRMED,
      });

      expect(order.status).toBe(OrderStatus.CONFIRMED);
    });
  });

  describe('updateStatus', () => {
    it('throws NotFoundException when the order does not exist for this restaurant', async () => {
      repository.findOne.mockResolvedValueOnce(null);

      await expect(
        service.updateStatus('missing-id', 'restaurant-1', {
          status: OrderStatus.CONFIRMED,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates and persists the new status', async () => {
      repository.findOne.mockResolvedValueOnce({
        id: 'order-1',
        restaurantId: 'restaurant-1',
        orderNumber: 'ORD-1',
        status: OrderStatus.PENDING,
      });

      const result = await service.updateStatus('order-1', 'restaurant-1', {
        status: OrderStatus.PREPARING,
      });

      expect(result.status).toBe(OrderStatus.PREPARING);
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: OrderStatus.PREPARING }),
      );
    });

    it('scopes the lookup to the requesting restaurant', async () => {
      repository.findOne.mockResolvedValueOnce({
        id: 'order-1',
        restaurantId: 'restaurant-1',
        status: OrderStatus.PENDING,
      });

      await service.updateStatus('order-1', 'restaurant-1', {
        status: OrderStatus.CONFIRMED,
      });

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: 'order-1', restaurantId: 'restaurant-1' },
      });
    });
  });
});
