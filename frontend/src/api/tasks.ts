// src/api/tasks.ts
import type { Task, PaginatedResponse } from "../types";
import { apiFetch } from "../utils/api";

export function fetchTasks(): Promise<Task[]> {
  return apiFetch<PaginatedResponse<Task>>(`/tasks/`).then((data) => data.results);
}

export function fetchTask(id: number): Promise<Task> {
  return apiFetch<Task>(`/tasks/${id}/`);
}

export function createTask(data: Partial<Task>): Promise<Task> {
  return apiFetch<Task>("/tasks/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateTask(id: number, data: Partial<Task>): Promise<Task> {
  return apiFetch<Task>(`/tasks/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteTask(id: number): Promise<void> {
  return apiFetch<void>(`/tasks/${id}/`, {
    method: "DELETE",
  });
}
