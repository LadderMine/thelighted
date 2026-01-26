"use client";

import { create } from "zustand";

export type WalletType = "freighter" | "albedo" | null;
export type PaymentAsset = "XLM" | "USDC";
export type TxStatus =
  | "idle"
  | "connecting"
  | "ready"
  | "signing"
  | "pending"
  | "success"
  | "error";

type PaymentState = {
  walletType: WalletType;
  publicKey: string | null;

  balances: {
    XLM: number;
    USDC: number;
  };

  selectedAsset: PaymentAsset;

  txHash: string | null;
  status: TxStatus;
  error: string | null;

  connectWallet: (wallet: WalletType) => Promise<void>;
  disconnectWallet: () => void;

  setBalances: (balances: { XLM: number; USDC: number }) => void;
  setAsset: (asset: PaymentAsset) => void;

  setTxStatus: (status: TxStatus) => void;
  setTxHash: (hash: string | null) => void;
  setError: (error: string | null) => void;
};

export const usePaymentStore = create<PaymentState>((set) => ({
  walletType: null,
  publicKey: null,

  balances: { XLM: 0, USDC: 0 },

  selectedAsset: "XLM",

  txHash: null,
  status: "idle",
  error: null,

  connectWallet: async (wallet) => {
    try {
      set({ status: "connecting", error: null });

      let publicKey: string;

      if (wallet === "freighter") {
        if (!window.freighterApi) {
          throw new Error("Freighter wallet not installed");
        }
        publicKey = await window.freighterApi.getPublicKey();
      } else if (wallet === "albedo") {
        const res = await fetch("https://albedo.link/api/public_key");
        const data = await res.json();
        publicKey = data.pubkey;
      } else {
        throw new Error("Unsupported wallet");
      }

      set({
        walletType: wallet,
        publicKey,
        status: "ready",
      });
    } catch (err: any) {
      set({
        status: "error",
        error: err?.message ?? "Wallet connection failed",
      });
    }
  },

  disconnectWallet: () =>
    set({
      walletType: null,
      publicKey: null,
      balances: { XLM: 0, USDC: 0 },
      selectedAsset: "XLM",
      txHash: null,
      status: "idle",
      error: null,
    }),

  setBalances: (balances) => set({ balances }),
  setAsset: (asset) => set({ selectedAsset: asset }),

  setTxStatus: (status) => set({ status }),
  setTxHash: (hash) => set({ txHash: hash }),
  setError: (error) => set({ error }),
}));
