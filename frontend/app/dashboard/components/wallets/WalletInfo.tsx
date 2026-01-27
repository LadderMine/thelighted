"use client";

import { usePaymentStore } from "@/app/shared/stores/payment.store";

export default function WalletInfo() {
  const { publicKey, balances, disconnectWallet } = usePaymentStore();

  if (!publicKey) return null;

  return (
    <div className="rounded border p-4 space-y-2">
      <p className="text-sm">
        Wallet:{" "}
        <span className="font-mono">
          {publicKey.slice(0, 6)}…{publicKey.slice(-4)}
        </span>
      </p>

      <p className="text-sm">XLM: {balances.XLM}</p>
      <p className="text-sm">USDC: {balances.USDC}</p>

      <button
        onClick={disconnectWallet}
        className="text-sm text-red-500 underline"
      >
        Disconnect
      </button>
    </div>
  );
}
