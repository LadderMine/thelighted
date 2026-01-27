import { api } from "@/app/shared/api";
import { useQuery } from "@tanstack/react-query";

export const useCustomers = () =>
  useQuery({
    queryKey: ["customers"],
    queryFn: () => api("/api/customers/insights"),
  });
