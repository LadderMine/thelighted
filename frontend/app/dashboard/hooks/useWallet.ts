import { api } from "@/app/shared/api";
import { useQuery } from "@tanstack/react-query";

export const useWallet = () =>
  useQuery({
    queryKey: ["wallet"],
    queryFn: () => api("/api/wallet"),
  });
