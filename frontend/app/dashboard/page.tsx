"use client";

import { useSocket } from "./hooks/useSocket";
import { Header } from "./components/Header";
import { Metrics } from "./components/Metrics";
import { OrdersBoard } from "./components/OrdersBoard";
import { Analytics } from "./components/Analytics";
import { Wallet } from "./components/Wallet";
import { Customers } from "./components/Customers";

export default function DashboardPage() {
  useSocket();

  return (
    <div className="space-y-8 p-6">
      <Header />
      <Metrics />
      <OrdersBoard />
      <Analytics />
      <Wallet />
      <Customers />
    </div>
  );
}
