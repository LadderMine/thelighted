import type {
  AccountTrustlinesResponse,
  BuildTrustlineResponse,
  CheckoutSummaryResponse,
  InitiatePaymentResponse,
  PaymentApiErrorBody,
  PaymentRecordResponse,
  SubmitSignedPaymentResponse,
  TrustlineSubmitResponse,
} from "@/lib/types/payments";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/**
 * Diner-facing fetch wrapper, deliberately separate from lib/api/client.ts.
 * That client authenticates with the staff `auth-token` from localStorage
 * and redirects to /login on a 401 — neither is correct for a diner who
 * authenticates with a short-lived, order-scoped checkout token (ADR 0002)
 * read from the checkout URL, not a staff session.
 */
export class CheckoutApiError extends Error {
  constructor(
    readonly code: string | undefined,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "CheckoutApiError";
  }
}

async function checkoutFetch<T>(
  checkoutToken: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${checkoutToken}`,
        ...init.headers,
      },
    });
  } catch {
    throw new CheckoutApiError(
      undefined,
      "Couldn't reach the server. Check your connection and try again."
    );
  }

  if (!response.ok) {
    let body: Partial<PaymentApiErrorBody> = {};
    try {
      body = (await response.json()) as Partial<PaymentApiErrorBody>;
    } catch {
      // non-JSON error body
    }
    throw new CheckoutApiError(
      body.code,
      body.message ?? `HTTP ${response.status}`,
      body.details
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export function fetchCheckoutSummary(
  checkoutToken: string,
  orderId: string
): Promise<CheckoutSummaryResponse> {
  return checkoutFetch(checkoutToken, `/api/orders/${orderId}/checkout-summary`);
}

export function fetchTrustlines(
  checkoutToken: string,
  publicKey: string
): Promise<AccountTrustlinesResponse> {
  return checkoutFetch(
    checkoutToken,
    `/api/payments/stellar/account/${publicKey}/trustlines`
  );
}

export function buildTrustlineTransaction(
  checkoutToken: string,
  body: { sourceAccount: string; assetCode: "USDC"; assetIssuer: string }
): Promise<BuildTrustlineResponse> {
  return checkoutFetch(checkoutToken, `/api/payments/stellar/account/trustline`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function submitTrustlineTransaction(
  checkoutToken: string,
  signedTransactionXdr: string
): Promise<TrustlineSubmitResponse> {
  return checkoutFetch(
    checkoutToken,
    `/api/payments/stellar/account/trustline/submit`,
    { method: "POST", body: JSON.stringify({ signedTransactionXdr }) }
  );
}

export function initiatePayment(
  checkoutToken: string,
  body: {
    orderId: string;
    sourceAccount: string;
    assetCode: "XLM" | "USDC";
    assetIssuer?: string;
    amount: string;
    idempotencyKey: string;
  }
): Promise<InitiatePaymentResponse> {
  return checkoutFetch(checkoutToken, `/api/payments/stellar/initiate`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function submitSignedPayment(
  checkoutToken: string,
  paymentId: string,
  signedTransactionXdr: string
): Promise<SubmitSignedPaymentResponse> {
  return checkoutFetch(
    checkoutToken,
    `/api/payments/stellar/${paymentId}/submit-signed`,
    { method: "POST", body: JSON.stringify({ signedTransactionXdr }) }
  );
}

export function fetchPaymentStatus(
  checkoutToken: string,
  paymentId: string
): Promise<PaymentRecordResponse> {
  return checkoutFetch(checkoutToken, `/api/payments/stellar/${paymentId}`);
}
