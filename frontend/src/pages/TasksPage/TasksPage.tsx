import React, { useCallback, useState } from "react";

import { useTasks, useCreateTask, useUpdateTask, useDeleteTask } from "../../hooks/useTasks";
import type { Task } from "../../types";
import Input from "../../components/Input/Input";
import Button from "../../components/Button/Button";
import PlayerItemList from "../../components/PlayerItemList/PlayerItemList";
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
  const { data: tasks, isLoading } = useTasks();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const [newName, setNewName] = useState("");
  const [hideCompleted, setHideCompleted] = useState(
    () => localStorage.getItem("tasks.hideCompleted") !== "false",
  );
  const safeTasks = Array.isArray(tasks) ? tasks : [];
  const visibleTasks = hideCompleted ? safeTasks.filter((t) => !isTaskComplete(t)) : safeTasks;

  const handleCreateTask = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newName.trim()) return;
    createTask.mutate({ name: newName.trim() });
    setNewName("");
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
      updateTask.mutate({
        id: task.id,
        data: {
          completed_at: isTaskComplete(task) ? null : new Date().toISOString(),
        },
      });
    },
    [updateTask],
  );

  if (isLoading) return <p>Loading tasks...</p>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Tasks</h1>
      </div>

      <form className={styles.addTaskForm} onSubmit={handleCreateTask}>
        <Input
          id="new-task-name"
          value={newName}
          onChange={(v) => setNewName(v as string)}
          placeholder="New task name"
          className={styles.addTaskInput}
        />
        <Button type="submit">
          <span className={styles.addButtonText}>Add task</span>
          <span className={styles.addButtonIcon} aria-hidden="true">✓</span>
        </Button>
      </form>

      {visibleTasks.length > 0 ? (
        <div className={styles.tasksList}>
          <PlayerItemList<ItemRecord>
            items={visibleTasks as ItemRecord[]}
            itemLabel="task"
            ariaLabel="Tasks"
            isItemComplete={isTaskComplete as (item: ItemRecord) => boolean}
            onToggleComplete={handleToggleComplete}
            renderItemMeta={(task) => formatLastWorkedOn(task as Task)}
            renderEditSummary={(task) => (
              <>
                {isTaskComplete(task as Task) ? "Complete" : "Incomplete"} • Total time: {formatRewardDuration((task as Task).total_time)}
              </>
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
        </div>
      ) : (
        <div className={styles.emptyState}>
          <p>{hideCompleted ? "No incomplete tasks." : "No tasks yet."}</p>
        </div>
      )}
    </div>
  );
}
