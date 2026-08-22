// Diner-facing checkout types — mirrors the backend's payments/orders DTOs
// (backend/src/modules/payments, backend/src/modules/orders). Kept separate
// from lib/types/api.ts, which is admin/staff-facing only.

export type PaymentAssetCode = "XLM" | "USDC";

export type PaymentStatus =
  | "pending"
  | "submitted"
  | "confirmed"
  | "failed"
  | "expired";

// Mirrors backend/src/modules/payments/errors/payment.errors.ts PaymentErrorCode.
export type PaymentErrorCode =
  | "INSUFFICIENT_BALANCE"
  | "MISSING_TRUSTLINE"
  | "SEQUENCE_CONFLICT"
  | "MALFORMED_REQUEST"
  | "IDEMPOTENCY_CONFLICT"
  | "RESTAURANT_WALLET_NOT_CONFIGURED"
  | "SUBMISSION_FAILED";

export interface CheckoutOrderLineItem {
  name: string;
  quantity: number;
  price: number;
}

export interface CheckoutSummaryResponse {
  orderId: string;
  orderNumber: string;
  items: CheckoutOrderLineItem[];
  total: number;
  currency: string;
  status: string;
}

export interface TrustlineBalance {
  assetCode: string;
  assetIssuer: string | null;
  balance: string;
}

export interface AccountTrustlinesResponse {
  funded: boolean;
  balances: TrustlineBalance[];
}

export interface BuildTrustlineResponse {
  unsignedTransactionXdr: string;
}

export interface TrustlineSubmitResponse {
  successful: boolean;
  hash: string;
}

export interface InitiatePaymentResponse {
  paymentId: string;
  status: PaymentStatus;
  unsignedTransactionXdr: string;
}

export interface SubmitSignedPaymentResponse {
  paymentId: string;
  status: PaymentStatus;
  stellarTxHash: string | null;
}

export interface PaymentRecordResponse {
  id: string;
  orderId: string;
  status: PaymentStatus;
  stellarTxHash: string | null;
  failureReason: PaymentErrorCode | null;
}

export interface PaymentApiErrorBody {
  code?: PaymentErrorCode;
  message: string;
  details?: unknown;
}
