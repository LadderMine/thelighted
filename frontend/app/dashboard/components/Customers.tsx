"use client";
import { useCustomers } from "../hooks/useCustomers";

export function Customers() {
  const { data } = useCustomers();
  if (!data) return null;

  return (
    <div>
      <p>Loyalty retention: {data.loyalty}%</p>
      <p>Avg rating: {data.rating}</p>
    </div>
  );
}
