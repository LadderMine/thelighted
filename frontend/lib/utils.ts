// frontend/lib/utils.ts
import { type ClassValue, clsx } from "clsx";

// Tailwind class name merger
export function cn(...inputs: ClassValue[]) {
return clsx(inputs);
}

// Format currency
export function formatCurrency(
amount: number,
currency: string = "NGN"
): string {
return new Intl.NumberFormat("en-NG", {
style: "currency",
currency,
}).format(amount);
}

// Format phone number for WhatsApp
export function formatWhatsAppNumber(phone: string): string {
return phone.replace(/[^0-9]/g, "");
}

// Generate WhatsApp order link
export function generateWhatsAppLink(
phone: string,
items: Array<{ name: string; quantity: number; price: number }>,
specialInstructions?: string
): string {
const formattedPhone = formatWhatsAppNumber(phone);

let message = `Hello! I'd like to place an order:\n\n`;

items.forEach((item, index) => {
message += `${index + 1}. ${item.name} x${item.quantity} - ${formatCurrency(
      item.price * item.quantity
    )}\n`;
});

const total = items.reduce(
(sum, item) => sum + item.price \* item.quantity,
0
);
message += `\nTotal: ${formatCurrency(total)}`;

if (specialInstructions) {
message += `\n\nSpecial Instructions: ${specialInstructions}`;
}

return `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
}

// Get time of day
export function getTimeOfDay(): "morning" | "afternoon" | "evening" | "night" {
const hour = new Date().getHours();

if (hour >= 5 && hour < 12) return "morning";
if (hour >= 12 && hour < 17) return "afternoon";
if (hour >= 17 && hour < 21) return "evening";
return "night";
}

// Get day of week
export function getDayOfWeek(): string {
return new Date().toLocaleDateString("en-US", { weekday: "long" });
}

// Check if restaurant is open
export function isRestaurantOpen(
openingHours: Array<{
day: string;
isOpen: boolean;
openTime?: string;
closeTime?: string;
}>
): boolean {
const now = new Date();
const currentDay = now.toLocaleDateString("en-US", { weekday: "long" });
const currentTime = now.toTimeString().slice(0, 5); // HH:MM format

const todayHours = openingHours.find((h) => h.day === currentDay);

if (!todayHours || !todayHours.isOpen) return false;
if (!todayHours.openTime || !todayHours.closeTime) return false;

return (
currentTime >= todayHours.openTime && currentTime <= todayHours.closeTime
);
}

// Get next opening time
export function getNextOpeningTime(
openingHours: Array<{
day: string;
isOpen: boolean;
openTime?: string;
closeTime?: string;
}>
): string {
const now = new Date();
const currentDay = now.toLocaleDateString("en-US", { weekday: "long" });

const todayHours = openingHours.find((h) => h.day === currentDay);

if (todayHours?.isOpen && todayHours.openTime) {
return `Today at ${todayHours.openTime}`;
}

// Find next open day
const daysOfWeek = [
"Sunday",
"Monday",
"Tuesday",
"Wednesday",
"Thursday",
"Friday",
"Saturday",
];
const currentDayIndex = daysOfWeek.indexOf(currentDay);

for (let i = 1; i < 7; i++) {
const nextDayIndex = (currentDayIndex + i) % 7;
const nextDay = daysOfWeek[nextDayIndex];
const nextDayHours = openingHours.find((h) => h.day === nextDay);

    if (nextDayHours?.isOpen && nextDayHours.openTime) {
      return `${nextDay} at ${nextDayHours.openTime}`;
    }

}

return "Check opening hours";
}

// Truncate text
export function truncateText(text: string, maxLength: number): string {
if (text.length <= maxLength) return text;
return text.slice(0, maxLength) + "...";
}

// Generate slug from text
export function generateSlug(text: string): string {
return text
.toLowerCase()
.replace(/[^\w\s-]/g, "")
.replace(/\s+/g, "-")
.replace(/-+/g, "-")
.trim();
}

// Debounce function
export function debounce<T extends (...args: any[]) => any>(
func: T,
wait: number
): (...args: Parameters<T>) => void {
let timeout: NodeJS.Timeout;

return function executedFunction(...args: Parameters<T>) {
const later = () => {
clearTimeout(timeout);
func(...args);
};

    clearTimeout(timeout);
    timeout = setTimeout(later, wait);

};
}

// Smooth scroll to element
export function smoothScrollTo(elementId: string) {
const element = document.getElementById(elementId);
if (element) {
element.scrollIntoView({ behavior: "smooth", block: "start" });
}
}

// Load image with blur placeholder
export async function getBase64ImageUrl(imageUrl: string): Promise<string> {
try {
const response = await fetch(imageUrl);
const buffer = await response.arrayBuffer();
const base64 = Buffer.from(buffer).toString("base64");
return `data:image/jpeg;base64,${base64}`;
} catch {
return "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
}
}
