import { UnprocessableEntityException } from '@nestjs/common';
import { assertValidTransition, canTransition } from './payment-state-machine';
import { PaymentStatus } from './payment.entity';

describe('payment state machine', () => {
  const ALL_STATUSES = Object.values(PaymentStatus);

  const VALID_TRANSITIONS: [PaymentStatus, PaymentStatus][] = [
    [PaymentStatus.PENDING, PaymentStatus.SUBMITTED],
    [PaymentStatus.PENDING, PaymentStatus.FAILED],
    [PaymentStatus.PENDING, PaymentStatus.EXPIRED],
    [PaymentStatus.SUBMITTED, PaymentStatus.CONFIRMED],
    [PaymentStatus.SUBMITTED, PaymentStatus.FAILED],
    [PaymentStatus.SUBMITTED, PaymentStatus.EXPIRED],
  ];

  it.each(VALID_TRANSITIONS)('allows %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(() => assertValidTransition(from, to)).not.toThrow();
  });

  const validSet = new Set(
    VALID_TRANSITIONS.map(([from, to]) => `${from}->${to}`),
  );

  const illegalTransitions = ALL_STATUSES.flatMap((from) =>
    ALL_STATUSES.filter((to) => !validSet.has(`${from}->${to}`)).map(
      (to): [PaymentStatus, PaymentStatus] => [from, to],
    ),
  );

  it.each(illegalTransitions)('rejects %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    expect(() => assertValidTransition(from, to)).toThrow(
      UnprocessableEntityException,
    );
  });

  it('never allows confirmed to be reached directly from pending', () => {
    expect(canTransition(PaymentStatus.PENDING, PaymentStatus.CONFIRMED)).toBe(
      false,
    );
  });

  it('has no outgoing transitions from any terminal status', () => {
    const terminal = [
      PaymentStatus.CONFIRMED,
      PaymentStatus.FAILED,
      PaymentStatus.EXPIRED,
    ];
    for (const status of terminal) {
      for (const to of ALL_STATUSES) {
        expect(canTransition(status, to)).toBe(false);
      }
    }
  });
});
