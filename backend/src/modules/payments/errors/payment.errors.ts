// backend/src/modules/payments/errors/payment.errors.ts
import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Every structured payment error carries a stable `code` in its response
 * body, distinct from the HTTP status, so #315's frontend can branch on
 * the specific failure rather than parsing a message string (issue #313:
 * "must surface a structured error, not a generic 500").
 */
export type PaymentErrorCode =
  | 'INSUFFICIENT_BALANCE'
  | 'MISSING_TRUSTLINE'
  | 'SEQUENCE_CONFLICT'
  | 'MALFORMED_REQUEST'
  | 'IDEMPOTENCY_CONFLICT'
  | 'RESTAURANT_WALLET_NOT_CONFIGURED'
  | 'SUBMISSION_FAILED';

export abstract class PaymentError extends HttpException {
  protected constructor(
    readonly code: PaymentErrorCode,
    message: string,
    status: HttpStatus,
    details?: unknown,
  ) {
    super({ code, message, details }, status);
  }
}

export class InsufficientBalanceError extends PaymentError {
  constructor(details?: unknown) {
    super(
      'INSUFFICIENT_BALANCE',
      'Source account has insufficient balance for this payment',
      HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    );
  }
}

export class MissingTrustlineError extends PaymentError {
  constructor(details?: unknown) {
    super(
      'MISSING_TRUSTLINE',
      'An account is missing a trustline for this asset',
      HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    );
  }
}

/**
 * The signed transaction's sequence number is stale — this can only
 * happen for a transaction that's already signed, so we cannot silently
 * "retry" (a new sequence requires a new signature). The caller must
 * re-initiate the payment.
 */
export class SequenceConflictError extends PaymentError {
  constructor() {
    super(
      'SEQUENCE_CONFLICT',
      'This payment’s transaction sequence is stale — please re-initiate the payment',
      HttpStatus.CONFLICT,
    );
  }
}

export class MalformedPaymentRequestError extends PaymentError {
  constructor(details?: unknown) {
    super(
      'MALFORMED_REQUEST',
      'The network rejected this request as malformed',
      HttpStatus.BAD_REQUEST,
      details,
    );
  }
}

export class IdempotencyConflictError extends PaymentError {
  constructor(message: string) {
    super('IDEMPOTENCY_CONFLICT', message, HttpStatus.CONFLICT);
  }
}

export class RestaurantWalletNotConfiguredError extends PaymentError {
  constructor() {
    super(
      'RESTAURANT_WALLET_NOT_CONFIGURED',
      'This restaurant has not configured a Stellar wallet yet',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class PaymentSubmissionError extends PaymentError {
  constructor(details?: unknown) {
    super(
      'SUBMISSION_FAILED',
      'The transaction was rejected by the network',
      HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    );
  }
}
