"use client";

import { usePaymentStore } from "@/app/shared/stores/payment.store";

export default function WalletConnectButton() {
  const { publicKey, connectWallet } = usePaymentStore();

  if (publicKey) return null;

  return (
    <button
      onClick={() => connectWallet("freighter")}
      className="px-4 py-2 rounded bg-black text-white"
    >
      Connect Wallet
    </button>
  );
}
