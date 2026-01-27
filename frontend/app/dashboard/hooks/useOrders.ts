import { useQuery } from "@tanstack/react-query";
import { api } from "@/app/shared/api";

export const useOrders = () =>
  useQuery({
    queryKey: ["orders"],
    queryFn: () => api("/api/orders"),
    refetchInterval: 10000,
  });
