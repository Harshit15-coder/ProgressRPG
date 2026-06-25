// src/api/skills.ts
import type { PlayerSkill, PaginatedResponse } from "../types";
import { apiFetch } from "../utils/api";

// The /groups/ endpoint returns a list of skill categories — no dedicated type yet,
// so we use a lightweight inline shape.
interface SkillGroup {
  id: number;
  name: string;
}

export function fetchGroups(): Promise<SkillGroup[]> {
  return apiFetch<SkillGroup[]>("/groups/");
}

export function fetchSkills(): Promise<PlayerSkill[]> {
  return apiFetch<PaginatedResponse<PlayerSkill>>(`/skills/`).then((data) => data.results);
}

export function fetchSkill(id: number): Promise<PlayerSkill> {
  return apiFetch<PlayerSkill>(`/skills/${id}/`);
}

export function createSkill(data: Partial<PlayerSkill>): Promise<PlayerSkill> {
  return apiFetch<PlayerSkill>("/skills/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateSkill(id: number, data: Partial<PlayerSkill>): Promise<PlayerSkill> {
  return apiFetch<PlayerSkill>(`/skills/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteSkill(id: number): Promise<void> {
  return apiFetch<void>(`/skills/${id}/`, {
    method: "DELETE",
  });
}
