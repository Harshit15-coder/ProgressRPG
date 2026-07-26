// src/hooks/useSkills.ts

import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { updateSkill, deleteSkill, fetchSkills, createSkill } from "../api/skills";
import type { PlayerSkill } from "../types";


export function useSkills() {
  return useQuery({
    queryKey: ["skills"],
    queryFn: fetchSkills,
    staleTime: 30_000,
  });
}


export function useCreateSkill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createSkill,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}


export function useUpdateSkill() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<PlayerSkill> }) => updateSkill(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}

export function useDeleteSkill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteSkill,
    onMutate: async (skillId: number) => {
      await queryClient.cancelQueries({ queryKey: ["skills"] });

      const previousSkills = queryClient.getQueryData<PlayerSkill[]>(["skills"]);

      queryClient.setQueryData<PlayerSkill[]>(["skills"], (old = []) =>
        old.filter((skill) => skill.id !== skillId)
      );

      return { previousSkills };
    },
    // Rollback on error
    onError: (_err: unknown, _skillId: number, context: { previousSkills?: PlayerSkill[] } | undefined) => {
      if (context?.previousSkills) {
        queryClient.setQueryData(["skills"], context.previousSkills);
      }
    },
    // Ensure the cache is in sync with backend
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}
