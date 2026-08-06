import React from "react";

import EntitySearchInput from "../EntitySearchInput/EntitySearchInput";
import Button from "../Button/Button";
import PlayerItemList from "../PlayerItemList/PlayerItemList";
import Tooltip from "../Tooltip/Tooltip";
import { isTaskComplete, taskSortOptions, useTasksPanel } from "./useTasksPanel";
import type { Task } from "../../types";
import styles from "./TasksPanel.module.scss";

interface TasksPanelProps {
  /** Opens the edit modal for this task id once the tasks have loaded. */
  openTaskId?: number | null;
  /** Called once the requested `openTaskId` has been opened, so the caller can clear it. */
  onOpenTaskHandled?: () => void;
  /** Called with a note id when the user creates or opens a task's linked note. */
  onOpenNote?: (noteId: number) => void;
}

export default function TasksPanel({
  openTaskId,
  onOpenTaskHandled,
  onOpenNote,
}: TasksPanelProps = {}): React.ReactElement | null {
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
    getLinkedNoteId,
    handleCreateNoteForTask,
  } = useTasksPanel(openTaskId, onOpenNote);

  if (isLoading) return <p>Loading tasks...</p>;

  return (
    <div className={styles.page}>
      <div className={styles.content}>
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
        <PlayerItemList<Task>
          items={visibleTasks}
          itemLabel="task"
          ariaLabel="Tasks"
          isItemComplete={isTaskComplete}
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
                {onOpenNote ? (
                  (() => {
                    const linkedNoteId = getLinkedNoteId(taskItem);
                    return linkedNoteId !== null ? (
                      <button
                        type="button"
                        className={styles.linkedNoteLink}
                        onClick={() => onOpenNote(linkedNoteId)}
                      >
                        View linked note
                      </button>
                    ) : (
                      <Button
                        variant="secondary"
                        onClick={() => handleCreateNoteForTask(taskItem)}
                      >
                        Create note for this task
                      </Button>
                    );
                  })()
                ) : null}
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
          openItemId={openTaskId}
          onOpenItemHandled={onOpenTaskHandled}
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
