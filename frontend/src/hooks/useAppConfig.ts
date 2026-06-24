import { useQuery } from "@tanstack/react-query";
import { fetchAppConfig } from "../api/appConfig";
import type { AppConfig } from "../types";

export function useAppConfig() {
  return useQuery<AppConfig>({
    queryKey: ["appConfig"],
    queryFn: fetchAppConfig,
    staleTime: 5 * 60 * 1000,
  });
}
