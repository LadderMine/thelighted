import { api } from "@/app/shared/api";
import { useQuery } from "@tanstack/react-query";

export const useAnalytics = (period: string) =>
  useQuery({
    queryKey: ["analytics", period],
    queryFn: () => api(`/api/analytics?period=${period}`),
  });
