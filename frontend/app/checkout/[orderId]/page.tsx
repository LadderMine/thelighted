"use client";

import { useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import StellarCheckout, {
  type CartItem,
  type SettlementAsset,
} from "@/components/checkout/StellarCheckout";
import { CheckoutApiError, fetchCheckoutSummary } from "@/lib/api/checkoutClient";

const PAYABLE_ASSETS: readonly SettlementAsset[] = ["XLM", "USDC"];

function isPayableAsset(value: string): value is SettlementAsset {
  return (PAYABLE_ASSETS as readonly string[]).includes(value);
}

/**
 * Diner-facing checkout page — the route the QR code printed at a table
 * actually points to (issue #315: the checkout component wasn't reachable
 * from any route before this). The order and its checkout token both come
 * from the URL: `orderId` from the path, the short-lived checkout token
 * (ADR 0002) from `?token=`, exactly as the staff-issued QR code encodes it.
 */
export default function CheckoutPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const checkoutToken = useSearchParams().get("token");
  const [cancelled, setCancelled] = useState(false);

  const summaryQuery = useQuery({
    queryKey: ["checkout-summary", orderId, checkoutToken],
    queryFn: () => fetchCheckoutSummary(checkoutToken as string, orderId),
    enabled: Boolean(orderId) && Boolean(checkoutToken),
    retry: false,
  });

  if (!checkoutToken) {
    return (
      <CheckoutMessage
        title="Missing checkout link"
        body="This link is missing its checkout token. Please rescan the table QR code."
      />
    );
  }

  if (cancelled) {
    return (
      <CheckoutMessage
        title="Checkout cancelled"
        body="You can rescan the table QR code to start again whenever you're ready."
      />
    );
  }

  if (summaryQuery.isLoading) {
    return (
      <div className="mx-auto max-w-md p-6">
        <p className="text-sm text-gray-500">Loading your order…</p>
      </div>
    );
  }

  if (summaryQuery.isError) {
    const message =
      summaryQuery.error instanceof CheckoutApiError
        ? summaryQuery.error.message
        : "Couldn't load this order.";
    return (
      <CheckoutMessage
        title="Couldn't load your order"
        body={`${message} If this checkout link is more than a few minutes old, rescan the table QR code for a fresh one.`}
      />
    );
  }

  const summary = summaryQuery.data;
  if (!summary) {
    return (
      <CheckoutMessage
        title="Couldn't load your order"
        body="No order data came back. Please rescan the table QR code."
      />
    );
  }
  if (!isPayableAsset(summary.currency)) {
    return (
      <CheckoutMessage
        title="This order can't be paid here yet"
        body={`This order is set up to settle in "${summary.currency}", which isn't supported by this checkout flow.`}
      />
    );
  }

  const items: CartItem[] = summary.items.map((item, index) => ({
    id: `${summary.orderId}-${index}`,
    name: item.name,
    price: item.price,
    quantity: item.quantity,
  }));

  return (
    <div className="mx-auto max-w-md p-6">
      <StellarCheckout
        orderId={summary.orderId}
        checkoutToken={checkoutToken}
        items={items}
        total={summary.total}
        asset={summary.currency}
        onCancel={() => setCancelled(true)}
      />
    </div>
  );
}

function CheckoutMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-md p-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <p className="mt-2 text-sm text-gray-600">{body}</p>
      </div>
    </div>
  );
}
