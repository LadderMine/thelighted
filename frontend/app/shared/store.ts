import { create } from "zustand";

type UIStore = {
  restaurantId: string | null;
  setRestaurant: (id: string) => void;
};

export const useUIStore = create<UIStore>((set) => ({
  restaurantId: null,
  setRestaurant: (id) => set({ restaurantId: id }),
}));
