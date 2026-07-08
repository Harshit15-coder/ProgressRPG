import React from "react";

import EntitySearchInput from "../../components/EntitySearchInput/EntitySearchInput";
import Button from "../../components/Button/Button";
import PlayerItemList from "../../components/PlayerItemList/PlayerItemList";
import Tooltip from "../../components/Tooltip/Tooltip";
import { isTaskComplete, taskSortOptions, useTasksPage, type ItemRecord } from "./useTasksPage";
import styles from "./TasksPage.module.scss";

interface TasksPageProps {
  showHeading?: boolean;
}

export default function TasksPage({ showHeading = true }: TasksPageProps = {}): React.ReactElement | null {
  const {
    isLoading,
    newName,
    setNewName,
    hideCompleted,
    visibleTasks,
    handleCreateTask,
    handleSubmitForm,
    handleEdit,
    handleDelete,
    handleToggleComplete,
    handleStartTask,
    toggleHideCompleted,
    getTaskMeta,
    getTaskEditSummary,
  } = useTasksPage();

  if (isLoading) return <p>Loading tasks...</p>;

  return (
    <div className={styles.page}>
      <div className={styles.content}>
      {showHeading && (
        <div className={styles.header}>
          <h1>Tasks</h1>
        </div>
      )}

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
          renderItemMeta={(task) => {
            const meta = getTaskMeta(task);
            return (
              <>
                {meta.lastWorkedOn}
                {meta.completionXp ? <> • +{meta.completionXp} XP</> : null}
              </>
            );
          }}
          renderEditSummary={(taskItem) => {
            const summary = getTaskEditSummary(taskItem);
            return (
              <>
                <div className={styles.taskTimestamps}>
                  <div>
                    <div className={styles.timestampLabel}>Created</div>
                    <div>{summary.created}</div>
                  </div>
                  <div>
                    <div className={styles.timestampLabel}>Modified</div>
                    <div>{summary.modified}</div>
                  </div>
                  <div>
                    <div className={styles.timestampLabel}>Completed</div>
                    <div>{summary.completed}</div>
                  </div>
                </div>
                <hr></hr>
                <div>
                  Total time: {summary.totalTime}
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
                aria-label={`Start working on ${task.name}`}
                onClick={async (event) => {
                  event.currentTarget.blur();
                  await handleStartTask(task);
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
              onClick={toggleHideCompleted}
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
