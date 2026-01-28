// frontend/src/lib/store/cartStore.ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { MenuItem } from "@/lib/types";

export interface CartItem {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  quantity: number;
}

interface CartStore {
  items: CartItem[];
  isModalOpen: boolean;
  selectedItem: MenuItem | null;

  // Computed values
  totalItems: number;
  totalPrice: number;

  // Actions
  addItem: (item: MenuItem, quantity: number) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  openModal: (item: MenuItem) => void;
  closeModal: () => void;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      isModalOpen: false,
      selectedItem: null,
      totalItems: 0,
      totalPrice: 0,

      addItem: (item: MenuItem, quantity: number) => {
        const { items } = get();
        const existingItem = items.find((i) => i.id === item.id);

        let newItems: CartItem[];

        if (existingItem) {
          newItems = items.map((i) =>
            i.id === item.id ? { ...i, quantity: i.quantity + quantity } : i,
          );
        } else {
          newItems = [
            ...items,
            {
              id: item.id,
              name: item.name,
              description: item.description,
              price: item.price,
              image: item.image,
              quantity,
            },
          ];
        }

        set({
          items: newItems,
          totalItems: newItems.reduce((sum, i) => sum + i.quantity, 0),
          totalPrice: newItems.reduce(
            (sum, i) => sum + i.price * i.quantity,
            0,
          ),
        });
      },

      removeItem: (id: string) => {
        const { items } = get();
        const newItems = items.filter((i) => i.id !== id);

        set({
          items: newItems,
          totalItems: newItems.reduce((sum, i) => sum + i.quantity, 0),
          totalPrice: newItems.reduce(
            (sum, i) => sum + i.price * i.quantity,
            0,
          ),
        });
      },

      updateQuantity: (id: string, quantity: number) => {
        if (quantity <= 0) {
          get().removeItem(id);
          return;
        }

        const { items } = get();
        const newItems = items.map((i) =>
          i.id === id ? { ...i, quantity } : i,
        );

        set({
          items: newItems,
          totalItems: newItems.reduce((sum, i) => sum + i.quantity, 0),
          totalPrice: newItems.reduce(
            (sum, i) => sum + i.price * i.quantity,
            0,
          ),
        });
      },

      clearCart: () => {
        set({
          items: [],
          totalItems: 0,
          totalPrice: 0,
        });
      },

      openModal: (item: MenuItem) => {
        set({
          isModalOpen: true,
          selectedItem: item,
        });
      },

      closeModal: () => {
        set({
          isModalOpen: false,
          selectedItem: null,
        });
      },
    }),
    {
      name: "restaurant-cart",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
