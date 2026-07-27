import React, { useCallback } from "react";

import Input from "../Input/Input";
import type { Project } from "../../types";
import Button from "../Button/Button";
import PlayerItemList from "../PlayerItemList/PlayerItemList";
import {
  useCreateProject,
  useDeleteProject,
  useProjects,
  useUpdateProject,
} from "../../hooks/useProjects";
import { useSimpleCrudPanel } from "../../hooks/useSimpleCrudPanel";
import { isCompletable } from "../../utils/completable";
import styles from "./ProjectsPanel.module.scss";

const renderProjectMeta = (project: Project) => (
  <>
    {project.description ? `${project.description} • ` : ""}
    Total time: {project.total_time} • Records: {project.total_records}
  </>
);

export default function ProjectsPanel(): React.ReactElement | null {
  const { isLoading, items, newName, setNewName, handleCreate, handleEdit, handleDelete, update } =
    useSimpleCrudPanel<Project>({
      useList: useProjects,
      useCreate: useCreateProject,
      useUpdate: useUpdateProject,
      useDelete: useDeleteProject,
    });

  const handleToggleComplete = useCallback(
    (project: Project) => {
      update.mutate({
        id: project.id,
        data: {
          completed_at: isCompletable(project) ? null : new Date().toISOString(),
        },
      });
    },
    [update],
  );

  if (isLoading) return <p>Loading projects...</p>;

  return (
    <div className={styles.page}>
      <form className={styles.addProjectForm} onSubmit={handleCreate}>
        <Input
          id="new-project-name"
          value={newName}
          onChange={(v) => setNewName(v as string)}
          placeholder="New project name"
          className={styles.addProjectInput}
        />
        <Button type="submit">
          <span className={styles.addButtonText}>Add project</span>
          <span className={styles.addButtonIcon} aria-hidden="true">✓</span>
        </Button>
      </form>

      {items.length > 0 ? (
        <div className={styles.projectsList}>
          <PlayerItemList<Project>
            items={items}
            itemLabel="project"
            ariaLabel="Projects"
            isItemComplete={isCompletable}
            onToggleComplete={handleToggleComplete}
            renderItemMeta={renderProjectMeta}
            renderEditSummary={(project) => (
              <>
                {isCompletable(project) ? "Complete" : "Incomplete"} • {renderProjectMeta(project)}
              </>
            )}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        </div>
      ) : (
        <div className={styles.emptyState}>
          <p>No projects yet.</p>
        </div>
      )}
    </div>
  );
}
