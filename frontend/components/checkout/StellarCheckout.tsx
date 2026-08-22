"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  buildTrustlineTransaction,
  CheckoutApiError,
  fetchPaymentStatus,
  fetchTrustlines,
  initiatePayment,
  submitSignedPayment,
  submitTrustlineTransaction,
} from "@/lib/api/checkoutClient";
import {
  connectWallet,
  disconnectWallet,
  signTransactionXdr,
  WalletError,
} from "@/lib/stellar/wallet";
import type { PaymentErrorCode, PaymentStatus } from "@/lib/types/payments";

export type SettlementAsset = "XLM" | "USDC";

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

interface StellarCheckoutProps {
  orderId: string;
  // Short-lived, order-scoped token from the QR-encoded checkout URL
  // (ADR 0002) — this, not a staff session, is what authorizes these calls.
  checkoutToken: string;
  items: CartItem[];
  // The order's total and settlement asset are decided when the order is
  // created (see backend/src/modules/orders/order.entity.ts) — not a free
  // choice made here. Offering an asset dropdown, as the old mock did,
  // would let a diner "pay" in an asset the order was never priced in.
  total: number;
  asset: SettlementAsset;
  onSuccess?: (result: { paymentId: string; stellarTxHash: string }) => void;
  onCancel?: () => void;
}

type Phase =
  | "connect"
  | "checking-trustline"
  | "needs-trustline"
  | "setting-up-trustline"
  | "ready"
  | "paying"
  | "confirming"
  | "success"
  | "error";

interface CheckoutError {
  message: string;
  retryable: boolean;
}

// Kept out of the backend's asset allowlist (only USDC needs a trustline —
// see backend dto/build-trustline.dto.ts) and undocumented on the network
// side, so unlike XLM/USDC an issuer address can't be safely hardcoded here.
// Without it configured, USDC checkout is disabled rather than guessed at.
const USDC_ASSET_ISSUER = process.env.NEXT_PUBLIC_USDC_ASSET_ISSUER;

// Mirrors StellarService.TRANSACTION_TIMEOUT_SECONDS — once a submitted
// transaction's timebounds pass without independent confirmation, the
// backend's reconciliation job marks it EXPIRED; polling past that point
// would just wait for a status that's already decided.
const STATUS_POLL_INTERVAL_MS = 3000;
const STATUS_POLL_TIMEOUT_MS = 180_000;

const STELLAR_EXPERT_NETWORK_SEGMENT =
  (process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? "testnet").toLowerCase() ===
  "public"
    ? "public"
    : "testnet";

function formatAssetAmount(amount: number): string {
  return amount.toFixed(7);
}

function describeError(error: unknown): CheckoutError {
  if (error instanceof WalletError) {
    if (error.kind === "wallet_rejected") {
      return {
        message: "You declined the request in your wallet.",
        retryable: true,
      };
    }
    return { message: `Wallet error: ${error.message}`, retryable: true };
  }

  if (error instanceof CheckoutApiError) {
    return {
      message: describePaymentErrorCode(
        error.code as PaymentErrorCode | undefined,
        error.message
      ),
      retryable: error.code !== "RESTAURANT_WALLET_NOT_CONFIGURED",
    };
  }

  return {
    message: error instanceof Error ? error.message : "Something went wrong.",
    retryable: true,
  };
}

function describePaymentErrorCode(
  code: PaymentErrorCode | undefined,
  fallback: string
): string {
  switch (code) {
    case "INSUFFICIENT_BALANCE":
      return "Your wallet doesn't have enough balance to cover this payment.";
    case "MISSING_TRUSTLINE":
      return "Your wallet is missing a trustline for this asset.";
    case "SEQUENCE_CONFLICT":
      return "This payment attempt expired — please try again.";
    case "RESTAURANT_WALLET_NOT_CONFIGURED":
      return "This restaurant hasn't set up a payout wallet yet. Please tell staff.";
    case "IDEMPOTENCY_CONFLICT":
      return "This checkout session is out of sync — please refresh and try again.";
    case "MALFORMED_REQUEST":
      return "This payment request was invalid. Please refresh and try again.";
    default:
      return fallback || "The network rejected this payment.";
  }
}

function describeTerminalStatus(
  status: PaymentStatus,
  failureReason: PaymentErrorCode | null
): CheckoutError {
  if (status === "expired") {
    return {
      message:
        "This payment expired before it could be confirmed. Please try again.",
      retryable: true,
    };
  }
  return {
    message: describePaymentErrorCode(failureReason ?? undefined, "This payment failed."),
    retryable: true,
  };
}

export default function StellarCheckout({
  orderId,
  checkoutToken,
  items,
  total,
  asset,
  onSuccess,
  onCancel,
}: StellarCheckoutProps) {
  const [phase, setPhase] = useState<Phase>("connect");
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [error, setError] = useState<CheckoutError | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const idempotencyKeyRef = useRef<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      void disconnectWallet();
    };
  }, []);

  function stopPolling(): void {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }

  async function checkTrustline(address: string): Promise<void> {
    if (!USDC_ASSET_ISSUER) {
      setError({
        message: "USDC payments aren't configured for this restaurant yet.",
        retryable: false,
      });
      setPhase("error");
      return;
    }
    try {
      const trustlines = await fetchTrustlines(checkoutToken, address);
      if (!trustlines.funded) {
        setError({
          message:
            "This wallet has no funded Stellar account yet. Fund it with a small amount of XLM, then reconnect.",
          retryable: false,
        });
        setPhase("error");
        return;
      }
      const hasTrustline = trustlines.balances.some(
        (b) => b.assetCode === "USDC" && b.assetIssuer === USDC_ASSET_ISSUER
      );
      setPhase(hasTrustline ? "ready" : "needs-trustline");
    } catch (err) {
      setError(describeError(err));
      setPhase("error");
    }
  }

  async function handleConnect(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const { address } = await connectWallet();
      setWalletAddress(address);
      // A new wallet is a new payment attempt — the old idempotency key (if
      // any) belonged to a payment sourced from a different account.
      idempotencyKeyRef.current = null;
      if (asset === "USDC") {
        setPhase("checking-trustline");
        await checkTrustline(address);
      } else {
        setPhase("ready");
      }
    } catch (err) {
      setError(describeError(err));
      setPhase("error");
    } finally {
      setBusy(false);
    }
  }

  async function handleSetupTrustline(): Promise<void> {
    if (!walletAddress || !USDC_ASSET_ISSUER) return;
    setError(null);
    setBusy(true);
    setPhase("setting-up-trustline");
    try {
      const built = await buildTrustlineTransaction(checkoutToken, {
        sourceAccount: walletAddress,
        assetCode: "USDC",
        assetIssuer: USDC_ASSET_ISSUER,
      });
      const signed = await signTransactionXdr(
        built.unsignedTransactionXdr,
        walletAddress
      );
      await submitTrustlineTransaction(checkoutToken, signed);
      setPhase("ready");
    } catch (err) {
      setError(describeError(err));
      setPhase("needs-trustline");
    } finally {
      setBusy(false);
    }
  }

  function startPolling(paymentId: string): void {
    const startedAt = Date.now();
    pollTimerRef.current = setInterval(() => {
      void (async () => {
        if (Date.now() - startedAt > STATUS_POLL_TIMEOUT_MS) {
          stopPolling();
          setError({
            message:
              "We couldn't confirm this payment in time. Check your wallet — it may still complete on-chain.",
            retryable: false,
          });
          setPhase("error");
          return;
        }
        try {
          const record = await fetchPaymentStatus(checkoutToken, paymentId);
          if (record.status === "confirmed") {
            stopPolling();
            setTxHash(record.stellarTxHash);
            setPhase("success");
            if (record.stellarTxHash) {
              onSuccess?.({ paymentId, stellarTxHash: record.stellarTxHash });
            }
          } else if (record.status === "failed" || record.status === "expired") {
            stopPolling();
            setError(describeTerminalStatus(record.status, record.failureReason));
            setPhase("error");
          }
          // pending/submitted: still confirming, keep polling.
        } catch {
          // A transient poll failure isn't fatal on its own — retry until
          // STATUS_POLL_TIMEOUT_MS gives up for good.
        }
      })();
    }, STATUS_POLL_INTERVAL_MS);
  }

  async function handlePay(): Promise<void> {
    if (!walletAddress) return;
    setError(null);
    setBusy(true);
    setPhase("paying");
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = crypto.randomUUID();
    }
    try {
      const initiated = await initiatePayment(checkoutToken, {
        orderId,
        sourceAccount: walletAddress,
        assetCode: asset,
        assetIssuer: asset === "USDC" ? USDC_ASSET_ISSUER : undefined,
        amount: formatAssetAmount(total),
        idempotencyKey: idempotencyKeyRef.current,
      });

      const signed = await signTransactionXdr(
        initiated.unsignedTransactionXdr,
        walletAddress
      );

      await submitSignedPayment(checkoutToken, initiated.paymentId, signed);
      setPhase("confirming");
      startPolling(initiated.paymentId);
    } catch (err) {
      setError(describeError(err));
      setPhase("ready");
    } finally {
      setBusy(false);
    }
  }

  function handleRetry(): void {
    setError(null);
    if (!walletAddress) {
      setPhase("connect");
    } else if (asset === "USDC") {
      setPhase("checking-trustline");
      void checkTrustline(walletAddress);
    } else {
      setPhase("ready");
    }
  }

  if (phase === "success" && txHash) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-green-200 bg-green-50 p-8">
        <div className="text-4xl">✅</div>
        <h2 className="text-xl font-semibold text-green-800">
          Payment Successful
        </h2>
        <p className="text-sm text-green-700">
          {formatAssetAmount(total)} {asset} sent
        </p>
        <p className="break-all rounded bg-green-100 p-2 font-mono text-xs text-green-900">
          {txHash}
        </p>
        <a
          href={`https://stellar.expert/explorer/${STELLAR_EXPERT_NETWORK_SEGMENT}/tx/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-blue-600 underline"
        >
          View on Stellar Explorer
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">Stellar Checkout</h2>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-gray-600">Order Summary</h3>
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex justify-between px-4 py-2 text-sm text-gray-700"
            >
              <span>
                {item.name} × {item.quantity}
              </span>
              <span>${(item.price * item.quantity).toFixed(2)}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between px-4 py-2 text-sm font-semibold text-gray-900">
          <span>Total</span>
          <span>
            {formatAssetAmount(total)} {asset}
          </span>
        </div>
      </div>

      {phase === "connect" && (
        <div className="flex flex-col gap-2 rounded-lg border border-gray-100 bg-gray-50 p-4">
          <p className="text-sm text-gray-600">
            Connect a Stellar wallet to pay. On a phone, use a wallet with its
            own in-app browser (e.g. LOBSTR) or Albedo — Freighter is a
            desktop browser extension only.
          </p>
          <button
            type="button"
            onClick={() => void handleConnect()}
            disabled={busy}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Connecting…" : "Connect Wallet"}
          </button>
        </div>
      )}

      {phase === "checking-trustline" && (
        <p className="text-sm text-gray-500">Checking your wallet…</p>
      )}

      {walletAddress && phase !== "connect" && phase !== "checking-trustline" && (
        <p className="break-all rounded-lg bg-gray-50 p-2 font-mono text-xs text-gray-500">
          Connected: {walletAddress}
        </p>
      )}

      {phase === "needs-trustline" && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">
            Your wallet doesn&apos;t trust USDC yet. This is a one-time setup
            transaction — you&apos;ll be asked to sign it, then you can pay.
          </p>
          <button
            type="button"
            onClick={() => void handleSetupTrustline()}
            disabled={busy}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            Set Up USDC Trustline
          </button>
        </div>
      )}

      {phase === "setting-up-trustline" && (
        <p className="text-sm text-gray-500">
          Waiting for your wallet to sign the trustline transaction…
        </p>
      )}

      {phase === "paying" && (
        <p className="text-sm text-gray-500">
          Waiting for your wallet to sign the payment…
        </p>
      )}

      {phase === "confirming" && (
        <p className="text-sm text-gray-500">
          Confirming your payment on the Stellar network…
        </p>
      )}

      {error && (
        <div role="alert" className="flex flex-col gap-2 rounded-lg bg-red-50 p-3">
          <p className="text-sm text-red-700">{error.message}</p>
          {/* Other phases (ready, needs-trustline) already show their own
              actionable button below — this generic retry only applies when
              "error" left no other button on screen. */}
          {phase === "error" && error.retryable && (
            <button
              type="button"
              onClick={handleRetry}
              className="self-start text-sm font-medium text-red-700 underline"
            >
              Try again
            </button>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={phase === "paying" || phase === "confirming" || phase === "setting-up-trustline"}
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
        {phase === "ready" && (
          <button
            type="button"
            onClick={() => void handlePay()}
            disabled={busy}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Processing…" : `Pay ${formatAssetAmount(total)} ${asset}`}
          </button>
        )}
      </div>
    </div>
  );
}
