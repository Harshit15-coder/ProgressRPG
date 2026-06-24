// src/hooks/useGroups.ts
import { useQuery } from "@tanstack/react-query";
import { fetchGroups } from "../api/skills";

export function useGroups() {
  return useQuery({
    queryKey: ["groups"],
    queryFn: fetchGroups,
  });
}
