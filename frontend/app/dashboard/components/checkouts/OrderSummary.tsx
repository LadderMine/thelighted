"use client";

import { useCartStore } from "@/app/shared/stores/cart.store";

export default function OrderSummary() {
  const { subtotal, itemCount } = useCartStore();

  return (
    <div className="sticky top-6 rounded-xl border p-4 space-y-2">
      <h3 className="font-semibold">Order Summary</h3>

      <p className="text-sm">Items: {itemCount()}</p>
      <p className="font-semibold">Total: ${subtotal().toFixed(2)}</p>
    </div>
  );
}
