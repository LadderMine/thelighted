// frontend/lib/types/index.ts
// Menu Types
export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: MenuCategory;
  image: string;
  isAvailable?: boolean;
  preparationTime?: number;
  clickCount?: number;
  moodTags?: MoodTag[];
  timeOfDay?: TimeOfDay[];
}

export type MenuCategory =
  | "appetizers_small_chops"
  | "soups"
  | "swallow"
  | "salads"
  | "rice_dishes"
  | "proteins"
  | "stews_sauces"
  | "bean_dishes"
  | "yam_dishes"
  | "grills_barbecue"
  | "special_delicacies"
  | "drinks"
  | "desserts"
  | "pasta";

export type MoodTag =
  | "spicy"
  | "comfort"
  | "light"
  | "adventurous"
  | "traditional"
  | "healthy"
  | "indulgent"
  | "festive"
  | "hearty"
  | "quick_bite"
  | "street_food"
  | "rich"
  | "refreshing";

export type TimeOfDay = "morning" | "afternoon" | "evening" | "night";

// Testimonial Types
export interface Testimonial {
  id: string;
  name: string;
  role?: string;
  avatar?: string;
  rating: number;
  comment: string;
  date: string;
}

// Opening Hours Types
export interface OpeningHours {
  day: string;
  isOpen: boolean;
  openTime?: string;
  closeTime?: string;
}

// Contact Form Types
export interface ContactFormData {
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
}

// Trending Item Types
export interface TrendingItem {
  item: MenuItem;
  orderCount: number;
  trend: "up" | "down" | "stable";
}

// Mood Board Types
export interface MoodOption {
  id: MoodTag;
  label: string;
  emoji: string;
  gradient: string;
  description: string;
}

// Smart Recommendation Types
export interface RecommendationContext {
  timeOfDay: TimeOfDay;
  dayOfWeek: string;
  weather?: "sunny" | "rainy" | "cold" | "hot";
}

// Instagram Post Types
export interface InstagramPost {
  id: string;
  imageUrl: string;
  caption: string;
  permalink: string;
  timestamp: string;
}

// SEO Types
export interface SEOConfig {
  title: string;
  description: string;
  keywords: string[];
  ogImage?: string;
  canonicalUrl?: string;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Cart Types (for WhatsApp order)
export interface CartItem {
  item: MenuItem;
  quantity: number;
  specialInstructions?: string;
}

// Restaurant Info Types
export interface RestaurantInfo {
  name: string;
  tagline: string;
  description: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: {
    street: string;
    city: string;
    state: string;
    country: string;
    zipCode?: string;
  };
  coordinates?: {
    lat: number;
    lng: number;
  };
  socialMedia: {
    instagram?: string;
    facebook?: string;
    twitter?: string;
  };
  openingHours: OpeningHours[];
}
