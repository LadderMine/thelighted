// backend/src/modules/payments/payment-state-machine.ts
import { UnprocessableEntityException } from '@nestjs/common';
import { PaymentStatus } from './payment.entity';

/**
 * The single source of truth for legal Payment status transitions (issue
 * #314): `pending -> submitted -> confirmed | failed | expired`.
 * `confirmed` is reachable only from `submitted` — never set directly on a
 * successful submit call, only after PaymentReconciliationService
 * independently verifies the transaction against Horizon by hash.
 */
const ALLOWED_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  [PaymentStatus.PENDING]: [
    PaymentStatus.SUBMITTED,
    PaymentStatus.FAILED,
    PaymentStatus.EXPIRED,
  ],
  [PaymentStatus.SUBMITTED]: [
    PaymentStatus.CONFIRMED,
    PaymentStatus.FAILED,
    PaymentStatus.EXPIRED,
  ],
  [PaymentStatus.CONFIRMED]: [],
  [PaymentStatus.FAILED]: [],
  [PaymentStatus.EXPIRED]: [],
};

export function canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertValidTransition(
  from: PaymentStatus,
  to: PaymentStatus,
): void {
  if (!canTransition(from, to)) {
    throw new UnprocessableEntityException(
      `Illegal payment status transition: ${from} -> ${to}`,
    );
  }
}
