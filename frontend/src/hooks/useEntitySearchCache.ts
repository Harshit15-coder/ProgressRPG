import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchActivities } from "../api/activities";
import { fetchTasks } from "../api/tasks";
import { useGame } from "../context/GameContext";
import type { PlayerActivity, Task } from "../types";

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

/** Normalized entity used in the search cache (activity or task). */
interface SearchEntity {
  id: number | string;
  name: string;
  taskId: number | null;
  completedAt: string | null;
  source: "activity" | "task";
  isOptimistic: boolean;
  frequency: number;
}

type EntityType = "activity";

// ---------------------------------------------------------------------------
// Cache keys
// ---------------------------------------------------------------------------

const ACTIVITY_LIST_CACHE_KEY = ["entity-search", "activity", "activities"];
const TASK_LIST_CACHE_KEY = ["entity-search", "activity", "tasks"];

const ENTITY_CONFIG: Record<EntityType, { queryKey: string[]; queryFn: () => Promise<PlayerActivity[]> }> = {
  activity: {
    queryKey: ["entity-search", "activity"],
    queryFn: async () => {
      const activities = await fetchActivities();
      return Array.isArray(activities) ? activities : [];
    },
  },
};

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function normalizeEntityName(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function getEntityNameKey(name: string): string {
  return normalizeEntityName(name).toLowerCase();
}

function getEntityCacheKey(entity: Pick<SearchEntity, "source" | "name">): string {
  return `${entity?.source ?? "activity"}:${getEntityNameKey(entity?.name)}`;
}

function normalizeActivityEntity(activity: Partial<PlayerActivity> & { isOptimistic?: boolean; frequency?: number } | null | undefined): SearchEntity | null {
  const name = normalizeEntityName(activity?.name);
  if (!name) return null;

  return {
    id: activity?.id ?? `activity-${name.toLowerCase()}`,
    name,
    taskId: null,
    completedAt: activity?.completed_at ?? null,
    source: "activity",
    isOptimistic: Boolean(activity?.isOptimistic),
    frequency: activity?.frequency ?? 0,
  };
}

function normalizeTaskEntity(task: Partial<Task> | null | undefined): SearchEntity | null {
  const name = normalizeEntityName(task?.name);
  if (!name) return null;

  return {
    id: task?.id ?? `task-${name.toLowerCase()}`,
    name,
    taskId: task?.id ?? null,
    completedAt: task?.completed_at ?? null,
    source: "task",
    isOptimistic: false,
    frequency: 0,
  };
}

function sortEntitiesByRecency(entities: SearchEntity[]): SearchEntity[] {
  return [...entities].sort((left, right) => {
    const leftTime = left.completedAt ? new Date(left.completedAt).getTime() : 0;
    const rightTime = right.completedAt ? new Date(right.completedAt).getTime() : 0;
    if (left.frequency !== right.frequency) return right.frequency - left.frequency;
    if (leftTime !== rightTime) return rightTime - leftTime;
    return left.name.localeCompare(right.name);
  });
}

function dedupeEntities(entities: SearchEntity[]): SearchEntity[] {
  const byName = new Map<string, SearchEntity>();
  sortEntitiesByRecency(entities).forEach((entity) => {
    const key = getEntityCacheKey(entity);
    if (!byName.has(key)) byName.set(key, entity);
  });
  return [...byName.values()];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useEntitySearchCache(type: EntityType) {
  const queryClient = useQueryClient();
  const config = ENTITY_CONFIG[type];

  if (!config) {
    throw new Error(`Unsupported entity search type: ${type}`);
  }

  const { gameSettings } = useGame();
  const includesTasks = gameSettings?.activity_search_includes_tasks ?? false;

  const query = useQuery<SearchEntity[]>({
    queryKey: config.queryKey,
    queryFn: async () => {
      const activities = await config.queryFn();
      const deduped = dedupeEntities(activities.map(normalizeActivityEntity).filter((e): e is SearchEntity => e !== null));
      queryClient.setQueryData(ACTIVITY_LIST_CACHE_KEY, deduped);
      return deduped;
    },
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });

  useQuery<SearchEntity[]>({
    queryKey: TASK_LIST_CACHE_KEY,
    queryFn: async () => {
      const tasks = await fetchTasks();
      return Array.isArray(tasks) ? tasks.map(normalizeTaskEntity).filter((e): e is SearchEntity => e !== null) : [];
    },
    enabled: includesTasks,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });

  const addEntityToCache = useCallback(
    (entityInput: string | Partial<PlayerActivity> & { isOptimistic?: boolean; frequency?: number }): SearchEntity | null => {
      const entity =
        typeof entityInput === "string"
          ? normalizeActivityEntity({ name: entityInput, isOptimistic: true })
          : normalizeActivityEntity(entityInput);

      if (!entity) return null;

      const updater = (currentEntities: SearchEntity[] = []): SearchEntity[] =>
        dedupeEntities(
          currentEntities
            .map((e) =>
              getEntityCacheKey(e) === getEntityCacheKey(entity)
                ? { ...e, frequency: (e.frequency || 0) + 1 }
                : e
            )
            .concat(entity.frequency > 0 ? [] : [entity])
        );

      queryClient.setQueryData(config.queryKey, updater);
      queryClient.setQueryData(ACTIVITY_LIST_CACHE_KEY, updater);

      return entity;
    },
    [config.queryKey, queryClient]
  );

  const activities = (queryClient.getQueryData<SearchEntity[]>(ACTIVITY_LIST_CACHE_KEY)) ?? [];
  const tasks = (queryClient.getQueryData<SearchEntity[]>(TASK_LIST_CACHE_KEY)) ?? [];
  const entities = includesTasks
    ? dedupeEntities([...(query.data ?? []), ...tasks])
    : (query.data ?? []);

  return {
    ...query,
    entities,
    activities,
    addEntityToCache,
  };
}
