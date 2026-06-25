// src/api/activities.ts
import type { PlayerActivity } from "../types";
import { apiFetch } from "../utils/api";

export function fetchActivities(): Promise<PlayerActivity[]> {
  return (async () => {
    const allResults: PlayerActivity[] = [];
    let page = 1;
    let hasNext = true;

    while (hasNext) {
      const data = await apiFetch<{ results?: PlayerActivity[]; next?: string | null }>(
        `/player-activities/?page=${page}`
      );
      const pageResults = Array.isArray(data?.results) ? data.results : [];
      allResults.push(...pageResults);
      hasNext = Boolean(data?.next);
      page += 1;
    }

    return allResults;
  })();
}

export function fetchActivity(id: number): Promise<PlayerActivity> {
  return apiFetch<PlayerActivity>(`/player-activities/${id}/`);
}

export function createActivity(data: Partial<PlayerActivity>): Promise<PlayerActivity> {
  return apiFetch<PlayerActivity>("/player-activities/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateActivity(id: number, data: Partial<PlayerActivity>): Promise<PlayerActivity> {
  return apiFetch<PlayerActivity>(`/player-activities/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteActivity(id: number): Promise<void> {
  return apiFetch<void>(`/player-activities/${id}/`, {
    method: "DELETE",
  });
}
