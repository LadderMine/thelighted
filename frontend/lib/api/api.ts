import type {
  ApiResponse,
  MenuItem,
  TrendingItem,
  ContactFormData,
  InstagramPost,
} from "@/lib/types";
import { GalleryImage } from "./admin";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:9001/api";
const RESTAURANT_ID = process.env.NEXT_PUBLIC_RESTAURANT_ID;

if (!RESTAURANT_ID) {
  console.error(
    "NEXT_PUBLIC_RESTAURANT_ID is not set in environment variables",
  );
}

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (response.status === 204) {
      return { success: true, data: undefined as T };
    }

    if (response.ok) {
      const data = await response.json();
      return { success: true, data };
    }

    if (response.status === 404) {
      console.log(`No data found for endpoint: ${endpoint}`);
      return { success: true, data: [] as T };
    }

    const errorData = await response.json().catch(() => ({}));
    const errorMessage =
      errorData.message || response.statusText || "Request failed";

    console.error(`API Error [${response.status}]:`, errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  } catch (error) {
    console.error("Network Error:", error);
    return {
      success: false,
      error:
        "Unable to connect to server. Please check your internet connection.",
    };
  }
}

function addRestaurantId(url: string): string {
  if (!RESTAURANT_ID) {
    console.warn("Restaurant ID not configured");
    return url;
  }

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}restaurantId=${RESTAURANT_ID}`;
}

// Menu API
export const menuApi = {
  getAll: () => fetchApi<MenuItem[]>(addRestaurantId("/menu")),

  getByCategory: (category: string) =>
    fetchApi<MenuItem[]>(addRestaurantId(`/menu/category/${category}`)),

  getById: (id: string) => fetchApi<MenuItem>(addRestaurantId(`/menu/${id}`)),

  incrementClickCount: (id: string) =>
    fetchApi<void>(addRestaurantId(`/menu/${id}/click`), { method: "POST" }),
};

// Trending API
export const trendingApi = {
  getTrending: (limit: number = 5) =>
    fetchApi<TrendingItem[]>(addRestaurantId(`/trending?limit=${limit}`)),

  getChefsFavorites: () =>
    fetchApi<MenuItem[]>(addRestaurantId("/trending/chefs-favorites")),

  getStats: () =>
    fetchApi<{
      totalInteractions: number;
      isUsingChefsFavorites: boolean;
      mode: "chefs-favorites" | "trending";
    }>(addRestaurantId("/trending/stats")),
};

// Contact API
export const contactApi = {
  submit: (data: ContactFormData) =>
    fetchApi<void>(addRestaurantId("/contact"), {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// Instagram API
export const instagramApi = {
  getPosts: (limit: number = 9) =>
    fetchApi<InstagramPost[]>(addRestaurantId(`/instagram?limit=${limit}`)),
};

// Gallery API
export const galleryApi = {
  getImages: (category?: string) => {
    const params = category ? `category=${category}` : "";
    const endpoint = params ? `/gallery?${params}` : "/gallery";
    return fetchApi<GalleryImage[]>(addRestaurantId(endpoint));
  },
};

// Analytics API
export const analyticsApi = {
  trackPageView: (page: string) =>
    fetchApi<void>(addRestaurantId("/analytics/pageview"), {
      method: "POST",
      body: JSON.stringify({ page, timestamp: new Date().toISOString() }),
    }),

  trackMenuItemView: (itemId: string) =>
    fetchApi<void>(addRestaurantId("/analytics/menu-view"), {
      method: "POST",
      body: JSON.stringify({ itemId, timestamp: new Date().toISOString() }),
    }),
};

// QR Code API
export const qrApi = {
  generate: (data: string) =>
    fetchApi<{ qrCode: string }>("/qr/generate", {
      method: "POST",
      body: JSON.stringify({ data }),
    }),
};

export default {
  menu: menuApi,
  trending: trendingApi,
  contact: contactApi,
  instagram: instagramApi,
  gallery: galleryApi,
  analytics: analyticsApi,
  qr: qrApi,
};
