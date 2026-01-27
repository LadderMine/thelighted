"use client";
import { useUIStore } from "@/app/shared/store";

export function Header() {
  const setRestaurant = useUIStore(s => s.setRestaurant);

  return (
    <div className="flex justify-between items-center">
      <select onChange={e => setRestaurant(e.target.value)}>
        <option>Select restaurant</option>
      </select>

      <div className="flex gap-2">
        <button>Create Item</button>
        <button>Run Promo</button>
        <button>Generate QR</button>
      </div>
    </div>
  );
}
