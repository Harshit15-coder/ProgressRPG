import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchActivities } from "../api/activities";
import { fetchTasks } from "../api/tasks";
import { useGame } from "../context/GameContext";

const ACTIVITY_LIST_CACHE_KEY = ["entity-search", "activity", "activities"];
const TASK_LIST_CACHE_KEY = ["entity-search", "activity", "tasks"];

const ENTITY_CONFIG = {
  activity: {
    queryKey: ["entity-search", "activity"],
    queryFn: async () => {
      const activities = await fetchActivities();
      return Array.isArray(activities) ? activities : [];
    },
  },
};

function normalizeEntityName(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function getEntityNameKey(name) {
  return normalizeEntityName(name).toLowerCase();
}

function getEntityCacheKey(entity) {
  return `${entity?.source ?? "activity"}:${getEntityNameKey(entity?.name)}`;
}

function normalizeActivityEntity(activity) {
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

function normalizeTaskEntity(task) {
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

function sortEntitiesByRecency(entities) {
  return [...entities].sort((left, right) => {
    const leftTime = left.completedAt ? new Date(left.completedAt).getTime() : 0;
    const rightTime = right.completedAt ? new Date(right.completedAt).getTime() : 0;
    if (left.frequency !== right.frequency) return right.frequency - left.frequency;
    if (leftTime !== rightTime) return rightTime - leftTime;
    return left.name.localeCompare(right.name);
  });
}

function dedupeEntities(entities) {
  const byName = new Map();
  sortEntitiesByRecency(entities).forEach((entity) => {
    const key = getEntityCacheKey(entity);
    if (!byName.has(key)) byName.set(key, entity);
  });
  return [...byName.values()];
}

export function useEntitySearchCache(type) {
  const queryClient = useQueryClient();
  const config = ENTITY_CONFIG[type];

  if (!config) {
    throw new Error(`Unsupported entity search type: ${type}`);
  }

  const { gameSettings } = useGame();
  const includesTasks = gameSettings?.activity_search_includes_tasks ?? false;

  const query = useQuery({
    queryKey: config.queryKey,
    queryFn: async () => {
      const activities = await config.queryFn();
      const deduped = dedupeEntities(activities.map(normalizeActivityEntity).filter(Boolean));
      queryClient.setQueryData(ACTIVITY_LIST_CACHE_KEY, deduped);
      return deduped;
    },
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });

  useQuery({
    queryKey: TASK_LIST_CACHE_KEY,
    queryFn: async () => {
      const tasks = await fetchTasks();
      return Array.isArray(tasks) ? tasks.map(normalizeTaskEntity).filter(Boolean) : [];
    },
    enabled: includesTasks,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });

  const addEntityToCache = useCallback(
    (entityInput) => {
      const entity =
        typeof entityInput === "string"
          ? normalizeActivityEntity({ name: entityInput, isOptimistic: true })
          : normalizeActivityEntity(entityInput);

      if (!entity) return null;

      const updater = (currentEntities = []) =>
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

  const activities = queryClient.getQueryData(ACTIVITY_LIST_CACHE_KEY) ?? [];
  const tasks = queryClient.getQueryData(TASK_LIST_CACHE_KEY) ?? [];
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
