"use client";

import { DndContext } from "@dnd-kit/core";
import { useOrders } from "../hooks/useOrders";
import { api } from "@/app/shared/api";

const cols = ["New", "Preparing", "Ready", "Completed"];

export function OrdersBoard() {
  const { data = [] } = useOrders();

  function onDragEnd(e: any) {
    api(`/api/orders/${e.active.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: e.over.id }),
    });
  }

  return (
    <DndContext onDragEnd={onDragEnd}>
      <div className="grid grid-cols-4 gap-4">
        {cols.map(c => (
          <div key={c}>
            <h3>{c}</h3>
            {data.filter((o: any) => o.status === c).map((o: any) => (
              <div key={o.id}>{o.id}</div>
            ))}
          </div>
        ))}
      </div>
    </DndContext>
  );
}
