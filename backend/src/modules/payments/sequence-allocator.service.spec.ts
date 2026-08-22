import { SequenceAllocator } from './sequence-allocator.service';

function makeStellarService(initialSequence: string) {
  return {
    loadAccount: jest.fn().mockResolvedValue({ sequence: initialSequence }),
  };
}

describe('SequenceAllocator', () => {
  describe('allocate', () => {
    it('returns account.sequence + 1 for the first allocation', async () => {
      const stellarService = makeStellarService('100');
      const allocator = new SequenceAllocator(stellarService as any);

      const sequence = await allocator.allocate('GACCOUNT');

      expect(sequence).toBe('101');
      expect(stellarService.loadAccount).toHaveBeenCalledTimes(1);
    });

    it('hands out consecutive sequences without refetching', async () => {
      const stellarService = makeStellarService('100');
      const allocator = new SequenceAllocator(stellarService as any);

      const first = await allocator.allocate('GACCOUNT');
      const second = await allocator.allocate('GACCOUNT');
      const third = await allocator.allocate('GACCOUNT');

      expect([first, second, third]).toEqual(['101', '102', '103']);
      expect(stellarService.loadAccount).toHaveBeenCalledTimes(1);
    });

    it('serializes concurrent allocations for the same account (no duplicate sequences)', async () => {
      const stellarService = makeStellarService('100');
      const allocator = new SequenceAllocator(stellarService as any);

      const results = await Promise.all(
        Array.from({ length: 20 }, () => allocator.allocate('GACCOUNT')),
      );

      expect(new Set(results).size).toBe(20);
      expect(stellarService.loadAccount).toHaveBeenCalledTimes(1);
    });

    it('tracks separate accounts independently', async () => {
      const stellarService = makeStellarService('100');
      const allocator = new SequenceAllocator(stellarService as any);

      const a = await allocator.allocate('GACCOUNT_A');
      const b = await allocator.allocate('GACCOUNT_B');

      expect(a).toBe('101');
      expect(b).toBe('101');
      expect(stellarService.loadAccount).toHaveBeenCalledTimes(2);
    });
  });

  describe('invalidate', () => {
    it('forces the next allocation to refetch from Horizon', async () => {
      const stellarService = makeStellarService('100');
      const allocator = new SequenceAllocator(stellarService as any);

      await allocator.allocate('GACCOUNT');
      allocator.invalidate('GACCOUNT');

      stellarService.loadAccount.mockResolvedValueOnce({ sequence: '200' });
      const sequence = await allocator.allocate('GACCOUNT');

      expect(sequence).toBe('201');
      expect(stellarService.loadAccount).toHaveBeenCalledTimes(2);
    });
  });
});
