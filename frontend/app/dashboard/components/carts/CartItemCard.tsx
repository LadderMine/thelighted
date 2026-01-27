"use client";

import { CartItem, useCartStore } from "@/app/shared/stores/cart.store";

export default function CartItemCard({ item }: { item: CartItem }) {
  const { updateQuantity, removeItem } = useCartStore();

  return (
    <div className="flex gap-4 border rounded-lg p-3">
      {item.image && (
        <img
          src={item.image}
          alt={item.name}
          className="w-16 h-16 object-cover rounded"
        />
      )}

      <div className="flex-1">
        <h4 className="font-medium">{item.name}</h4>

        {item.customizations?.length ? (
          <p className="text-xs text-gray-500">
            {item.customizations.join(", ")}
          </p>
        ) : null}

        <div className="flex items-center gap-3 mt-2">
          <input
            type="number"
            min={1}
            value={item.quantity}
            onChange={(e) =>
              updateQuantity(item.id, Number(e.target.value))
            }
            className="w-16 border rounded px-2 py-1"
          />

          <span className="text-sm font-medium">
            ${(item.priceFiat * item.quantity).toFixed(2)}
          </span>
        </div>
      </div>

      <button
        onClick={() => removeItem(item.id)}
        className="text-sm text-red-500"
      >
        Remove
      </button>
    </div>
  );
}
