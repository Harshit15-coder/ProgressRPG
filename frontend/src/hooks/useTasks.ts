// src/hooks/useTasks.ts

import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { updateTask, deleteTask, fetchTasks, createTask } from "../api/tasks";
import type { TaskUpdateResponse } from "../api/tasks";
import type { Task } from "../types";


export function useTasks(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["tasks"],
    queryFn: fetchTasks,
    enabled: options?.enabled ?? true,
  });
}


export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}


export function useUpdateTask() {
  const qc = useQueryClient();

  return useMutation<TaskUpdateResponse, Error, { id: number; data: Partial<Task> }>({
    mutationFn: ({ id, data }) => updateTask(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteTask,
    onMutate: async (taskId: number) => {
      await queryClient.cancelQueries({ queryKey: ["tasks"] });

      const previousTasks = queryClient.getQueryData<Task[]>(["tasks"]);

      queryClient.setQueryData<Task[]>(["tasks"], (old = []) =>
        old.filter((task) => task.id !== taskId)
      );
      return { previousTasks };
    },

    // Rollback on error
    onError: (_err: unknown, _taskId: number, context: { previousTasks?: Task[] } | undefined) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(["tasks"], context.previousTasks);
      }
    },
    // Ensure the cache is in sync with backend
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}
