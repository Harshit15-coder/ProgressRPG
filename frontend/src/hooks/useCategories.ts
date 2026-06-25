// src/hooks/useCategories.ts

import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { updateCategory, deleteCategory, fetchCategories, createCategory } from "../api/categories";
import type { Category } from "../types";


export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });
}


export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}


export function useUpdateCategory() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Category> }) => updateCategory(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteCategory,
    onMutate: async (categoryId: number) => {
      await queryClient.cancelQueries({ queryKey: ["categories"] });

      const previousCategories = queryClient.getQueryData<Category[]>(["categories"]);

      queryClient.setQueryData<Category[]>(["categories"], (old = []) =>
        old.filter((category) => category.id !== categoryId)
      );

      return { previousCategories };
    },
    // Rollback on error
    onError: (_err: unknown, _categoryId: number, context: { previousCategories?: Category[] } | undefined) => {
      if (context?.previousCategories) {
        queryClient.setQueryData(["categories"], context.previousCategories);
      }
    },
    // Ensure the cache is in sync with backend
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}
