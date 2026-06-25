// hooks/useTutorialSteps.ts
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../utils/api";
import type { TutorialStep, PaginatedResponse } from "../types";

async function fetchTutorialSteps(): Promise<PaginatedResponse<TutorialStep> | TutorialStep[]> {
  return apiFetch<PaginatedResponse<TutorialStep> | TutorialStep[]>("/tutorial-steps/");
}

export default function useTutorialSteps() {
  const { data, isLoading } = useQuery({
    queryKey: ["tutorial-steps"],
    queryFn: fetchTutorialSteps,
    staleTime: 10 * 60 * 1000,
  });

  const steps: TutorialStep[] = Array.isArray(data)
    ? data
    : (data as PaginatedResponse<TutorialStep> | undefined)?.results ?? [];

  return {
    steps,
    isLoading,
  };
}
