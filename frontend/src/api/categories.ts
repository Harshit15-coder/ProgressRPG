// src/api/categories.ts
import type { Category, PaginatedResponse } from "../types";
import { apiFetch } from "../utils/api";

export function fetchCategories(): Promise<Category[]> {
  return apiFetch<PaginatedResponse<Category>>(`/categories/`).then((data) => data.results);
}

export function fetchCategory(id: number): Promise<Category> {
  return apiFetch<Category>(`/categories/${id}/`);
}

export function createCategory(data: Partial<Category>): Promise<Category> {
  return apiFetch<Category>("/categories/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateCategory(id: number, data: Partial<Category>): Promise<Category> {
  return apiFetch<Category>(`/categories/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteCategory(id: number): Promise<void> {
  return apiFetch<void>(`/categories/${id}/`, {
    method: "DELETE",
  });
}
