// backend/src/modules/payments/errors/horizon-error-mapper.ts
import { NotFoundError } from '@stellar/stellar-sdk';
import {
  InsufficientBalanceError,
  MalformedPaymentRequestError,
  MissingTrustlineError,
  PaymentError,
  PaymentSubmissionError,
  SequenceConflictError,
} from './payment.errors';

interface TransactionFailedData {
  extras: {
    result_codes: {
      transaction: string;
      operations?: string[];
    };
  };
}

function isTransactionFailedData(data: unknown): data is TransactionFailedData {
  const candidate = data as Partial<TransactionFailedData> | undefined;
  return typeof candidate?.extras?.result_codes?.transaction === 'string';
}

/**
 * Maps a Horizon submission failure to a structured, distinguishable
 * PaymentError instead of letting a generic 500 reach the caller (issue
 * #313 acceptance criteria). Horizon's own NetworkError subclasses
 * (BadRequestError et al.) all carry `.response.data` with this shape for
 * a rejected transaction.
 */
export function mapHorizonSubmissionError(error: unknown): PaymentError {
  const data = (error as { response?: { data?: unknown } } | undefined)
    ?.response?.data;

  if (isTransactionFailedData(data)) {
    const txCode = data.extras.result_codes.transaction;
    const opCodes = data.extras.result_codes.operations ?? [];
    const rawCodes = { transaction: txCode, operations: opCodes };

    if (txCode === 'tx_bad_seq') {
      return new SequenceConflictError();
    }
    if (
      txCode === 'tx_insufficient_balance' ||
      opCodes.includes('op_underfunded') ||
      opCodes.includes('op_low_reserve')
    ) {
      return new InsufficientBalanceError(rawCodes);
    }
    if (opCodes.includes('op_no_trust') || opCodes.includes('op_no_issuer')) {
      return new MissingTrustlineError(rawCodes);
    }
    if (
      txCode === 'tx_bad_auth' ||
      txCode === 'tx_bad_auth_extra' ||
      txCode === 'tx_missing_operation' ||
      opCodes.includes('op_malformed')
    ) {
      return new MalformedPaymentRequestError(rawCodes);
    }
    return new PaymentSubmissionError(rawCodes);
  }

  if (error instanceof NotFoundError) {
    return new PaymentSubmissionError({
      reason: 'source_or_destination_account_not_found',
    });
  }

  return new PaymentSubmissionError(
    error instanceof Error ? error.message : String(error),
  );
}
