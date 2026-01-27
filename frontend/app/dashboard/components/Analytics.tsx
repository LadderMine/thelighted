"use client";
import { LineChart, Line, PieChart, Pie } from "recharts";
import { useAnalytics } from "../hooks/useAnalytics";
import { exportCSV } from "@/app/shared/csv";

export function Analytics() {
  const { data } = useAnalytics("month");
  if (!data) return null;

  return (
    <>
      <LineChart width={500} height={300} data={data.revenue}>
        <Line dataKey="fiat" />
        <Line dataKey="crypto" />
      </LineChart>

      <PieChart width={300} height={300}>
        <Pie data={data.payments} dataKey="value" />
      </PieChart>

      <button onClick={() => exportCSV("sales.csv", data.revenue)}>
        Export CSV
      </button>
    </>
  );
}
