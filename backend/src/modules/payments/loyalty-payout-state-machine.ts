// backend/src/modules/payments/loyalty-payout-state-machine.ts
import { UnprocessableEntityException } from '@nestjs/common';
import { LoyaltyPayoutStatus } from './loyalty-payout.entity';

/**
 * The single source of truth for legal LoyaltyPayout status transitions
 * (issue #316 / ADR 0004): `pending -> submitted -> confirmed | failed`,
 * with two differences from Payment (ADR 0003):
 *  - `pending -> failed` directly is also legal — building/signing the
 *    payout transaction itself can fail before anything is ever submitted
 *    (e.g. a malformed destination), and that must still be recordable as
 *    FAILED rather than stuck PENDING forever.
 *  - `failed -> submitted` is legal — a failed payout is retried
 *    automatically by LoyaltyPayoutService with a fresh submission, rather
 *    than being a dead end the diner has to re-trigger.
 * `confirmed` is reachable only from `submitted`, and only after
 * independently verifying the transaction against Horizon by hash — same
 * discipline as Payment's CONFIRMED.
 */
const ALLOWED_TRANSITIONS: Record<LoyaltyPayoutStatus, LoyaltyPayoutStatus[]> = {
  [LoyaltyPayoutStatus.PENDING]: [
    LoyaltyPayoutStatus.SUBMITTED,
    LoyaltyPayoutStatus.FAILED,
  ],
  [LoyaltyPayoutStatus.SUBMITTED]: [
    LoyaltyPayoutStatus.CONFIRMED,
    LoyaltyPayoutStatus.FAILED,
  ],
  [LoyaltyPayoutStatus.FAILED]: [LoyaltyPayoutStatus.SUBMITTED],
  [LoyaltyPayoutStatus.CONFIRMED]: [],
};

export function canTransitionPayout(
  from: LoyaltyPayoutStatus,
  to: LoyaltyPayoutStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertValidPayoutTransition(
  from: LoyaltyPayoutStatus,
  to: LoyaltyPayoutStatus,
): void {
  if (!canTransitionPayout(from, to)) {
    throw new UnprocessableEntityException(
      `Illegal loyalty payout status transition: ${from} -> ${to}`,
    );
  }
}
