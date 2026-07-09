import { useQuery } from "@tanstack/react-query";
import { fetchRegistrationStatus } from "../api/registrationStatus";
import type { RegistrationStatus } from "../types";

export function useRegistrationStatus() {
  return useQuery<RegistrationStatus>({
    queryKey: ["registrationStatus"],
    queryFn: fetchRegistrationStatus,
    staleTime: 60 * 1000,
  });
}
