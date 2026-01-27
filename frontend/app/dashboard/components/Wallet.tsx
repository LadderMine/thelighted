"use client";
import { useWallet } from "../hooks/useWallet";

export function Wallet() {
  const { data } = useWallet();
  if (!data) return null;

  return (
    <div>
      <p>{data.address}</p>
      {data.balances.map((b: any) => (
        <p key={b.asset}>{b.asset}: {b.amount}</p>
      ))}
    </div>
  );
}
