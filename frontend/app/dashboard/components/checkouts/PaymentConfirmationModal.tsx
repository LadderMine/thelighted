"use client";

import { usePaymentStore } from "@/app/shared/stores/payment.store";

export default function PaymentConfirmationModal() {
  const { status, txHash, error } = usePaymentStore();

  if (status === "idle") return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
      <div className="bg-white rounded-xl p-6 w-full max-w-md text-center">
        {status === "pending" && <p>Processing payment…</p>}
        {status === "success" && (
          <>
            <p className="font-semibold">Payment Successful 🎉</p>
            <a
              href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
              target="_blank"
              className="text-sm underline"
            >
              View Transaction
            </a>
          </>
        )}
        {status === "error" && (
          <p className="text-red-500">{error}</p>
        )}
      </div>
    </div>
  );
}
