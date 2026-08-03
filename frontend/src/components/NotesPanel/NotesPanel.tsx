import React from "react";

import Button from "../Button/Button";
import Input from "../Input/Input";
import List from "../List/List";
import Modal from "../Modal/Modal";
import { useNotesPanel } from "./useNotesPanel";
import styles from "./NotesPanel.module.scss";

function bodyPreview(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length <= 140) return trimmed;
  return `${trimmed.slice(0, 140)}…`;
}

export default function NotesPanel(): React.ReactElement | null {
  const {
    isLoading,
    visibleNotes,
    taskOptions,
    getTaskName,
    newTitle,
    setNewTitle,
    newBody,
    setNewBody,
    newTaskId,
    setNewTaskId,
    handleCreate,
    activeNote,
    editTitle,
    setEditTitle,
    editBody,
    setEditBody,
    editTaskId,
    setEditTaskId,
    confirmingDelete,
    openNote,
    closeNote,
    handleEditSave,
    handleDeleteRequest,
    cancelDeleteRequest,
    handleDeleteConfirm,
  } = useNotesPanel();

  if (isLoading) return <p>Loading notes...</p>;

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <form className={styles.addNoteForm} onSubmit={handleCreate}>
          <Input
            id="new-note-title"
            value={newTitle}
            onChange={(v) => setNewTitle(v as string)}
            placeholder="New note title"
            className={styles.addNoteTitleInput}
          />
          <textarea
            aria-label="new note body"
            className={styles.addNoteBodyInput}
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            placeholder="Note content (optional)"
            rows={2}
          />
          {taskOptions.length > 0 ? (
            <select
              aria-label="Attach to task"
              className={styles.taskSelect}
              value={newTaskId}
              onChange={(e) => setNewTaskId(e.target.value)}
            >
              <option value="">No linked task</option>
              {taskOptions.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.name}
                </option>
              ))}
            </select>
          ) : null}
          <Button type="submit">Add note</Button>
        </form>

        <div className={styles.notesList}>
          {visibleNotes.length > 0 ? (
            <List
              items={visibleNotes}
              ariaLabel="Notes"
              canHover
              className={styles.list}
              sectionClass={styles.section}
              renderItem={(note) => {
                const linkedTaskName = getTaskName(note.task);
                return (
                  <button
                    type="button"
                    className={styles.noteButton}
                    aria-label={`Open note ${note.title}`}
                    onClick={() => openNote(note)}
                  >
                    <div className={styles.noteDetails}>
                      <div className={styles.noteTitle}>{note.title}</div>
                      {note.body ? (
                        <div className={styles.noteMeta}>{bodyPreview(note.body)}</div>
                      ) : null}
                      {linkedTaskName ? (
                        <div className={styles.noteMeta}>Linked task: {linkedTaskName}</div>
                      ) : null}
                    </div>
                  </button>
                );
              }}
            />
          ) : (
            <div className={styles.emptyState}>
              <p>No notes yet.</p>
            </div>
          )}
        </div>
      </div>

      {activeNote ? (
        <Modal
          id="edit-note-modal"
          title={confirmingDelete ? "Delete note?" : "Edit note"}
          onClose={closeNote}
          onBack={confirmingDelete ? cancelDeleteRequest : undefined}
          backLabel="Back"
        >
          {confirmingDelete ? (
            <div className={styles.deleteConfirmContent}>
              <p>
                Are you sure you want to delete
                {activeNote.title ? ` "${activeNote.title}"` : " this note"}?
              </p>
              <div className={styles.deleteConfirmActions}>
                <Button variant="secondary" onClick={closeNote}>
                  Cancel
                </Button>
                <Button variant="danger" onClick={handleDeleteConfirm}>
                  Delete
                </Button>
              </div>
            </div>
          ) : (
            <div className={styles.editContent}>
              <Input
                id="edit-note-title"
                label="Title"
                value={editTitle}
                onChange={(v) => setEditTitle(v as string)}
              />
              <label className={styles.bodyLabel} htmlFor="edit-note-body">
                Body
              </label>
              <textarea
                id="edit-note-body"
                className={styles.editBodyInput}
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                rows={6}
              />
              {taskOptions.length > 0 ? (
                <>
                  <label className={styles.bodyLabel} htmlFor="edit-note-task">
                    Linked task
                  </label>
                  <select
                    id="edit-note-task"
                    className={styles.taskSelect}
                    value={editTaskId}
                    onChange={(e) => setEditTaskId(e.target.value)}
                  >
                    <option value="">No linked task</option>
                    {taskOptions.map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.name}
                      </option>
                    ))}
                  </select>
                </>
              ) : null}
              <div className={styles.editActions}>
                <Button variant="primary" onClick={handleEditSave}>
                  Save
                </Button>
                <Button variant="secondary" onClick={closeNote}>
                  Cancel
                </Button>
                <Button variant="secondaryDanger" onClick={handleDeleteRequest}>
                  Delete
                </Button>
              </div>
            </div>
          )}
        </Modal>
      ) : null}
    </div>
  );
}
