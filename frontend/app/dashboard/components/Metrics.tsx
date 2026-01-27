"use client";
import { useMetrics } from "../hooks/useMetrics";

export function Metrics() {
  const { data } = useMetrics();
  if (!data) return null;

  return (
    <div className="grid grid-cols-4 gap-4">
      {Object.entries(data).map(([k, v]: any) => (
        <div key={k} className="p-4 bg-white rounded">
          <p>{k}</p>
          <strong>{v.value}</strong>
          <span>{v.change}%</span>
        </div>
      ))}
    </div>
  );
}
