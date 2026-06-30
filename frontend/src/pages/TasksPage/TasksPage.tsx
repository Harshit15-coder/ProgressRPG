import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useTasks, useCreateTask, useUpdateTask, useDeleteTask } from "../../hooks/useTasks";
import { useGame } from "../../context/GameContext";
import type { Task } from "../../types";
import EntitySearchInput from "../../components/EntitySearchInput/EntitySearchInput";
import Button from "../../components/Button/Button";
import PlayerItemList from "../../components/PlayerItemList/PlayerItemList";
import Tooltip from "../../components/Tooltip/Tooltip";
import type { SortOption } from "../../components/PlayerItemList/PlayerItemList";
import { formatRewardDuration } from "../../utils/formatUtils";
import styles from "./TasksPage.module.scss";

const isTaskComplete = (task: Task): boolean => Boolean(task?.completed_at ?? task?.is_complete);

type ItemRecord = Task & { [key: string]: unknown };

const taskSortOptions: SortOption<ItemRecord>[] = [
  {
    key: "last-worked",
    label: "Last worked",
    compareFn: (a, b) => {
      const ta = (a as Task).last_worked_on ? new Date((a as Task).last_worked_on!).getTime() : 0;
      const tb = (b as Task).last_worked_on ? new Date((b as Task).last_worked_on!).getTime() : 0;
      return tb - ta;
    },
  },
  {
    key: "name",
    label: "Name",
    compareFn: (a, b) => ((a as Task).name ?? "").localeCompare((b as Task).name ?? ""),
  },
  {
    key: "created",
    label: "Created",
    compareFn: (a, b) =>
      new Date((b as Task).created_at).getTime() - new Date((a as Task).created_at).getTime(),
  },
];

function formatTimestamp(timestamp: string | null | undefined): string {
  if (!timestamp) return "—";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatLastWorkedOn(task: Task): string {
  const timestamp = task?.last_worked_on;
  if (!timestamp) return "No time recorded";

  const workedOn = new Date(timestamp);
  if (Number.isNaN(workedOn.getTime())) return "No time recorded";

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfWorkedOn = new Date(workedOn.getFullYear(), workedOn.getMonth(), workedOn.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfWorkedOn.getTime()) / (24 * 60 * 60 * 1000));

  if (diffDays === 0) return "Last worked on today";
  if (diffDays === 1) return "Last worked on yesterday";
  if (diffDays < 7) return `Last worked on ${diffDays} days ago`;

  const diffWeeks = Math.floor(diffDays / 7);
  return `Last worked on ${diffWeeks} ${diffWeeks === 1 ? "week" : "weeks"} ago`;
}

export default function TasksPage(): React.ReactElement | null {
  const navigate = useNavigate();
  const { fetchPlayerAndCharacter, activityTimer, freeTimerLimitSeconds, player } = useGame();
  const isPremium = Boolean(player?.is_premium);
  const { data: tasks, isLoading } = useTasks();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const [newName, setNewName] = useState("");
  const [completionReward, setCompletionReward] = useState<{ taskId: number; xp: number } | null>(null);

  useEffect(() => {
    if (!completionReward) return;
    const timer = setTimeout(() => setCompletionReward(null), 4000);
    return () => clearTimeout(timer);
  }, [completionReward]);
  const [hideCompleted, setHideCompleted] = useState(
    () => localStorage.getItem("tasks.hideCompleted") !== "false",
  );
  const safeTasks = Array.isArray(tasks) ? tasks : [];
  const visibleTasks = hideCompleted ? safeTasks.filter((t) => !isTaskComplete(t)) : safeTasks;

  const handleCreateTask = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    createTask.mutate({ name: trimmed });
    setNewName("");
  }, [createTask]);

  const handleSubmitForm = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    handleCreateTask(newName);
  };

  const handleEdit = useCallback(
    (task: ItemRecord, name: string) => {
      updateTask.mutate({ id: task.id, data: { name } });
    },
    [updateTask],
  );

  const handleDelete = useCallback(
    (task: ItemRecord) => {
      deleteTask.mutate(task.id);
    },
    [deleteTask],
  );

  const handleToggleComplete = useCallback(
    (task: ItemRecord) => {
      const completing = !isTaskComplete(task);
      updateTask.mutate(
        {
          id: task.id,
          data: {
            is_complete: completing,
            completed_at: completing ? new Date().toISOString() : null,
          },
        },
        {
          onSuccess: (data) => {
            if (data.completion_xp_gained > 0) {
              setCompletionReward({ taskId: task.id, xp: data.completion_xp_gained });
              fetchPlayerAndCharacter();
            }
          },
        }
      );
    },
    [updateTask, fetchPlayerAndCharacter],
  );

  if (isLoading) return <p>Loading tasks...</p>;

  return (
    <div className={styles.page}>
      <div className={styles.content}>
      <div className={styles.header}>
        <h1>Tasks</h1>
      </div>

      <form className={styles.addTaskForm} onSubmit={handleSubmitForm}>
        <EntitySearchInput
          type="task"
          value={newName}
          onChange={(v) => setNewName(v)}
          onCreate={handleCreateTask}
          placeholder="New task name"
          className={styles.addTaskInput}
        />
        <Button type="submit">
          <span className={styles.addButtonText}>Add task</span>
          <span className={styles.addButtonIcon} aria-hidden="true">✓</span>
        </Button>
      </form>

      <div className={styles.tasksList}>
        <PlayerItemList<ItemRecord>
          items={visibleTasks as ItemRecord[]}
          itemLabel="task"
          ariaLabel="Tasks"
          isItemComplete={isTaskComplete as (item: ItemRecord) => boolean}
          onToggleComplete={handleToggleComplete}
          renderItemMeta={(task) => (
            <>
              {formatLastWorkedOn(task as Task)}
              {completionReward?.taskId === (task as Task).id && (
                <> • +{completionReward.xp} XP</>
              )}
            </>
          )}
          renderEditSummary={(taskItem) => {
            const task = taskItem as Task;
            const complete = isTaskComplete(task);
            const modifiedTs =
              task.last_updated && task.created_at &&
              Math.abs(new Date(task.last_updated).getTime() - new Date(task.created_at).getTime()) > 2000
                ? formatTimestamp(task.last_updated)
                : "—";
            return (
              <>
                <div className={styles.taskTimestamps}>
                  <div>
                    <div className={styles.timestampLabel}>Created</div>
                    <div>{formatTimestamp(task.created_at)}</div>
                  </div>
                  <div>
                    <div className={styles.timestampLabel}>Modified</div>
                    <div>{modifiedTs}</div>
                  </div>
                  <div>
                    <div className={styles.timestampLabel}>Completed</div>
                    <div>{complete ? formatTimestamp(task.completed_at) : "—"}</div>
                  </div>
                </div>
                <hr></hr>
                <div>
                  Total time: {formatRewardDuration(task.total_time)}
                </div>
              </>
            );
          }}
          hoverEdit
          renderRowActions={(task) => (
            <Tooltip content="Start working on this task">
              <button
                type="button"
                className={styles.taskPlayButton}
                aria-label={`Start working on ${(task as Task).name}`}
                onClick={async (event) => {
                  event.currentTarget.blur();
                  const name = (task as Task).name;
                  if (!name || activityTimer?.status === "active") return;
                  await activityTimer?.startActivity({
                    text: name,
                    taskId: (task as Task).id,
                    limitSeconds: isPremium ? null : freeTimerLimitSeconds,
                  });
                  navigate("/timer");
                }}
              >
                ▷
              </button>
            </Tooltip>
          )}
          onEdit={handleEdit}
          onDelete={handleDelete}
          sortOptions={taskSortOptions}
          controls={
            <Button
              variant={hideCompleted ? "primary" : "secondary"}
              onClick={() => setHideCompleted((v) => {
                localStorage.setItem("tasks.hideCompleted", String(!v));
                return !v;
              })}
              className={styles.filterToggle}
            >
              {hideCompleted ? "Show complete" : "Hide complete"}
            </Button>
          }
        />
        {visibleTasks.length === 0 && (
          <div className={styles.emptyState}>
            <p>{hideCompleted ? "No incomplete tasks." : "No tasks yet."}</p>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
