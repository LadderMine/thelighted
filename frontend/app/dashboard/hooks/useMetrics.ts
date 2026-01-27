import { api } from "@/app/shared/api";
import { useQuery } from "@tanstack/react-query";

export const useMetrics = () =>
  useQuery({
    queryKey: ["metrics"],
    queryFn: () => api("/api/dashboard/metrics"),
  });
