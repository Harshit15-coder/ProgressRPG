import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchActivities } from "../api/activities";
import { fetchTasks } from "../api/tasks";
import { useFeatureFlag } from "./useFeatureFlag";
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

type EntityType = "activity" | "task";

// ---------------------------------------------------------------------------
// Cache keys
// ---------------------------------------------------------------------------

const ACTIVITY_LIST_CACHE_KEY = ["entity-search", "activity", "activities"];
const TASK_LIST_CACHE_KEY = ["entity-search", "activity", "tasks"];

const ENTITY_CONFIG: Record<EntityType, { queryKey: string[]; fetchAndNormalize: () => Promise<SearchEntity[]> }> = {
  activity: {
    queryKey: ["entity-search", "activity"],
    fetchAndNormalize: async () => {
      const activities = await fetchActivities();
      return dedupeEntities(
        (Array.isArray(activities) ? activities : [])
          .map(normalizeActivityEntity)
          .filter((e): e is SearchEntity => e !== null)
      );
    },
  },
  task: {
    queryKey: ["entity-search", "task"],
    fetchAndNormalize: async () => {
      const tasks = await fetchTasks();
      return dedupeEntities(
        (Array.isArray(tasks) ? tasks : [])
          .map((t) => normalizeTaskEntity(t, true))
          .filter((e): e is SearchEntity => e !== null)
      );
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

function normalizeTaskEntity(task: Partial<Task> | null | undefined, includeCompleted = false): SearchEntity | null {
  const name = normalizeEntityName(task?.name);
  if (!name) return null;
  if (!includeCompleted && (task?.is_complete || task?.completed_at)) return null;

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

  const includesTasks = useFeatureFlag("tasksFeature");

  const query = useQuery<SearchEntity[]>({
    queryKey: config.queryKey,
    queryFn: async () => {
      const entities = await config.fetchAndNormalize();
      if (type === "activity") {
        queryClient.setQueryData(ACTIVITY_LIST_CACHE_KEY, entities);
      }
      return entities;
    },
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });

  // For activity type only: also fetch tasks to surface them as suggestions
  useQuery<SearchEntity[]>({
    queryKey: TASK_LIST_CACHE_KEY,
    queryFn: async () => {
      const tasks = await fetchTasks();
      return Array.isArray(tasks) ? tasks.map((t) => normalizeTaskEntity(t)).filter((e): e is SearchEntity => e !== null) : [];
    },
    enabled: type === "activity" && includesTasks,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });

  const addEntityToCache = useCallback(
    (entityInput: string | Partial<PlayerActivity> & { isOptimistic?: boolean; frequency?: number }): SearchEntity | null => {
      if (type !== "activity") return null;

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
    [type, config.queryKey, queryClient]
  );

  const activities = (queryClient.getQueryData<SearchEntity[]>(ACTIVITY_LIST_CACHE_KEY)) ?? [];
  const taskEntities = (queryClient.getQueryData<SearchEntity[]>(TASK_LIST_CACHE_KEY)) ?? [];

  const entities = type === "task"
    ? (query.data ?? [])
    : (includesTasks
      ? dedupeEntities([...(query.data ?? []), ...taskEntities])
      : (query.data ?? []));

  return {
    ...query,
    entities,
    activities,
    addEntityToCache,
  };
}
