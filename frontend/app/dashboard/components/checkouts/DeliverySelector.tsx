"use client";

import { useState } from "react";

type Mode = "delivery" | "pickup" | "dine-in";

export default function DeliverySelector() {
  const [mode, setMode] = useState<Mode>("delivery");
  const [address, setAddress] = useState("");
  const [time, setTime] = useState("");
  const [table, setTable] = useState("");

  return (
    <div className="rounded-xl border p-4 space-y-4">
      <h3 className="font-semibold text-lg">Delivery Options</h3>

      <div className="flex gap-2">
        {(["delivery", "pickup", "dine-in"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-4 py-2 rounded border capitalize ${
              mode === m ? "bg-black text-white" : ""
            }`}
          >
            {m.replace("-", " ")}
          </button>
        ))}
      </div>

      {mode === "delivery" && (
        <input
          type="text"
          placeholder="Delivery address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="w-full border rounded px-3 py-2"
        />
      )}

      {mode === "dine-in" && (
        <input
          type="text"
          placeholder="Table number"
          value={table}
          onChange={(e) => setTable(e.target.value)}
          className="w-full border rounded px-3 py-2"
        />
      )}

      <input
        type="time"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        className="w-full border rounded px-3 py-2"
      />
