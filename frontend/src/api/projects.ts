// src/api/projects.ts
import type { Project, PaginatedResponse } from "../types";
import { apiFetch } from "../utils/api";

export function fetchProjects(): Promise<Project[]> {
  return apiFetch<PaginatedResponse<Project>>("/projects/").then((data) => data.results);
}

export function fetchProject(id: number): Promise<Project> {
  return apiFetch<Project>(`/projects/${id}/`);
}

export function createProject(data: Partial<Project>): Promise<Project> {
  return apiFetch<Project>("/projects/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateProject(id: number, data: Partial<Project>): Promise<Project> {
  return apiFetch<Project>(`/projects/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteProject(id: number): Promise<void> {
  return apiFetch<void>(`/projects/${id}/`, {
    method: "DELETE",
  });
}
