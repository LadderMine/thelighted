import { UnprocessableEntityException } from '@nestjs/common';
import {
  assertValidPayoutTransition,
  canTransitionPayout,
} from './loyalty-payout-state-machine';
import { LoyaltyPayoutStatus } from './loyalty-payout.entity';

describe('loyalty payout state machine', () => {
  const ALL_STATUSES = Object.values(LoyaltyPayoutStatus);

  const VALID_TRANSITIONS: [LoyaltyPayoutStatus, LoyaltyPayoutStatus][] = [
    [LoyaltyPayoutStatus.PENDING, LoyaltyPayoutStatus.SUBMITTED],
    [LoyaltyPayoutStatus.PENDING, LoyaltyPayoutStatus.FAILED],
    [LoyaltyPayoutStatus.SUBMITTED, LoyaltyPayoutStatus.CONFIRMED],
    [LoyaltyPayoutStatus.SUBMITTED, LoyaltyPayoutStatus.FAILED],
    [LoyaltyPayoutStatus.FAILED, LoyaltyPayoutStatus.SUBMITTED],
  ];

  it.each(VALID_TRANSITIONS)('allows %s -> %s', (from, to) => {
    expect(canTransitionPayout(from, to)).toBe(true);
    expect(() => assertValidPayoutTransition(from, to)).not.toThrow();
  });

  const validSet = new Set(
    VALID_TRANSITIONS.map(([from, to]) => `${from}->${to}`),
  );

  const illegalTransitions = ALL_STATUSES.flatMap((from) =>
    ALL_STATUSES.filter((to) => !validSet.has(`${from}->${to}`)).map(
      (to): [LoyaltyPayoutStatus, LoyaltyPayoutStatus] => [from, to],
    ),
  );

  it.each(illegalTransitions)('rejects %s -> %s', (from, to) => {
    expect(canTransitionPayout(from, to)).toBe(false);
    expect(() => assertValidPayoutTransition(from, to)).toThrow(
      UnprocessableEntityException,
    );
  });

  it('never allows confirmed to be reached directly from pending', () => {
    expect(
      canTransitionPayout(
        LoyaltyPayoutStatus.PENDING,
        LoyaltyPayoutStatus.CONFIRMED,
      ),
    ).toBe(false);
  });

  it('allows a failed payout to be retried via a fresh submission, unlike Payment', () => {
    expect(
      canTransitionPayout(
        LoyaltyPayoutStatus.FAILED,
        LoyaltyPayoutStatus.SUBMITTED,
      ),
    ).toBe(true);
  });

  it('has no outgoing transitions from the only true terminal status (confirmed)', () => {
    for (const to of ALL_STATUSES) {
      expect(canTransitionPayout(LoyaltyPayoutStatus.CONFIRMED, to)).toBe(
        false,
      );
    }
  });
});
