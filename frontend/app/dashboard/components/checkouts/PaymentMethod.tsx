"use client";

import { usePaymentStore } from "@/app/shared/stores/payment.store";

export default function PaymentMethod() {
  const {
    walletType,
    publicKey,
    selectedAsset,
    balances,
    status,
    connectWallet,
    setAsset,
  } = usePaymentStore();

  return (
    <div className="rounded-xl border p-4 space-y-4">
      <h3 className="font-semibold text-lg">Payment Method</h3>

      {!publicKey ? (
        <div className="flex gap-3">
          <button
            onClick={() => connectWallet("freighter")}
            className="px-4 py-2 rounded bg-black text-white"
          >
            Connect Freighter
          </button>
          <button
            onClick={() => connectWallet("albedo")}
            className="px-4 py-2 rounded border"
          >
            Connect Albedo
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Connected wallet:{" "}
            <span className="font-mono">
              {publicKey.slice(0, 6)}…{publicKey.slice(-4)}
            </span>
          </p>

          <div className="flex gap-3">
            {(["XLM", "USDC"] as const).map((asset) => (
              <button
                key={asset}
                onClick={() => setAsset(asset)}
                className={`px-4 py-2 rounded border ${
                  selectedAsset === asset
                    ? "border-black bg-black text-white"
                    : ""
                }`}
              >
                {asset} ({balances[asset]})
              </button>
            ))}
          </div>
        </div>
      )}

      {status === "connecting" && (
        <p className="text-sm text-gray-500">Connecting wallet…</p>
      )}
    </div>
  );
}
