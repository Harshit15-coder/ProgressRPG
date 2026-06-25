import React, { useCallback, useState } from "react";

import Input from "../../components/Input/Input";
import type { Project } from "../../types";
import Button from "../../components/Button/Button";
import PlayerItemList from "../../components/PlayerItemList/PlayerItemList";
import {
  useCreateProject,
  useDeleteProject,
  useProjects,
  useUpdateProject,
} from "../../hooks/useProjects";
import styles from "./ProjectsPage.module.scss";

const isProjectComplete = (project: Project): boolean => Boolean(project?.completed_at ?? project?.is_complete);

export default function ProjectsPage(): React.ReactElement | null {
  const { data: projects, isLoading } = useProjects();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();

  const [newName, setNewName] = useState("");
  const safeProjects = Array.isArray(projects) ? projects : [];

  const handleCreateProject = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedName = newName.trim();
    if (!trimmedName) return;

    createProject.mutate({ name: trimmedName });
    setNewName("");
  };

  // Cast to satisfy PlayerItemList's generic index-signature constraint
  type ItemRecord = Project & { [key: string]: unknown };

  const handleEdit = useCallback(
    (project: ItemRecord, name: string) => {
      updateProject.mutate({ id: project.id, data: { name } });
    },
    [updateProject],
  );

  const handleDelete = useCallback(
    (project: ItemRecord) => {
      deleteProject.mutate(project.id);
    },
    [deleteProject],
  );

  const handleToggleComplete = useCallback(
    (project: ItemRecord) => {
      updateProject.mutate({
        id: project.id,
        data: {
          completed_at: isProjectComplete(project) ? null : new Date().toISOString(),
        },
      });
    },
    [updateProject],
  );

  if (isLoading) return <p>Loading projects...</p>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Projects</h1>
      </div>

      <form className={styles.addProjectForm} onSubmit={handleCreateProject}>
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

      {safeProjects.length > 0 ? (
        <div className={styles.projectsList}>
          <PlayerItemList<ItemRecord>
            items={safeProjects as ItemRecord[]}
            itemLabel="project"
            ariaLabel="Projects"
            isItemComplete={isProjectComplete as (item: ItemRecord) => boolean}
            onToggleComplete={handleToggleComplete}
            renderItemMeta={(project) => (
              <>
                {(project as Project).description ? `${(project as Project).description} • ` : ""}
                Total time: {(project as Project).total_time} • Records: {(project as Project).total_records}
              </>
            )}
            renderEditSummary={(project) => (
              <>
                {isProjectComplete(project as Project) ? "Complete" : "Incomplete"} •{" "}
                {(project as Project).description ? `${(project as Project).description} • ` : ""}
                Total time: {(project as Project).total_time} • Records: {(project as Project).total_records}
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
