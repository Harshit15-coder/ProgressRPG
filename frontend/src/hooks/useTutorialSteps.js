import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../utils/api";

async function fetchTutorialSteps() {
  return apiFetch("/tutorial-steps/");
}

export default function useTutorialSteps() {
  const { data, isLoading } = useQuery({
    queryKey: ["tutorial-steps"],
    queryFn: fetchTutorialSteps,
    staleTime: 10 * 60 * 1000,
  });

  return {
    steps: data?.results ?? data ?? [],
    isLoading,
  };
}
