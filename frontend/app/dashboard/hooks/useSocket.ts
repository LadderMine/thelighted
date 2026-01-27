"use client";

import { useEffect } from "react";
import { socket } from "@/app/shared/socket";
import { useQueryClient } from "@tanstack/react-query";

export function useSocket() {
  const qc = useQueryClient();

  useEffect(() => {
    socket.connect();

    socket.on("new_order", () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      new Audio("/sounds/new.mp3").play();
    });

    socket.on("order_updated", () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
    });

    socket.on("payment_received", () => {
      qc.invalidateQueries();
    });

    return () => {
      socket.disconnect();
    };
  }, [qc]);
}
