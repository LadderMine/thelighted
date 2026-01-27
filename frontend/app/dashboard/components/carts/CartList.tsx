"use client";

import { useCartStore } from "@/app/shared/stores/cart.store";
import CartItemCard from "./CartItemCard";
import EmptyCart from "./EmptyCart";

export default function CartList() {
  const { items, clearCart, itemCount } = useCartStore();

  if (!items.length) return <EmptyCart />;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">
          Cart ({itemCount()} items)
        </h3>

        <button
          onClick={clearCart}
          className="text-sm text-red-500"
        >
          Clear Cart
        </button>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <CartItemCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
