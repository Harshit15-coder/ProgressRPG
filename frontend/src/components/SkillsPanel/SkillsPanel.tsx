import React, { useCallback, useState } from "react";

import { useSkills, useCreateSkill, useUpdateSkill, useDeleteSkill } from "../../hooks/useSkills";
import type { PlayerSkill } from "../../types";
import Input from "../Input/Input";
import Button from "../Button/Button";
import PlayerItemList from "../PlayerItemList/PlayerItemList";
import styles from "./SkillsPanel.module.scss";

export default function SkillsPanel(): React.ReactElement | null {
  const { data: skills, isLoading } = useSkills();
  const createSkill = useCreateSkill();
  const updateSkill = useUpdateSkill();
  const deleteSkill = useDeleteSkill();

  const [newName, setNewName] = useState("");
  const safeSkills = Array.isArray(skills) ? skills : [];

  const handleCreateSkill = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newName.trim()) return;
    createSkill.mutate({ name: newName.trim() });
    setNewName("");
  };

  // Cast to satisfy PlayerItemList's generic index-signature constraint
  type ItemRecord = PlayerSkill & { [key: string]: unknown };

  const handleEdit = useCallback(
    (skill: ItemRecord, name: string) => {
      updateSkill.mutate({ id: skill.id, data: { name } });
    },
    [updateSkill],
  );

  const handleDelete = useCallback(
    (skill: ItemRecord) => {
      deleteSkill.mutate(skill.id);
    },
    [deleteSkill],
  );

  if (isLoading) return <p>Loading skills...</p>;

  return (
    <div className={styles.page}>
      <form className={styles.addSkillForm} onSubmit={handleCreateSkill}>
        <Input
          id="new-skill-name"
          value={newName}
          onChange={(v) => setNewName(v as string)}
          placeholder="New skill name"
          className={styles.addSkillInput}
        />
        <Button type="submit">Add skill</Button>
      </form>

      {safeSkills.length > 0 ? (
        <div className={styles.skillsList}>
          <PlayerItemList<ItemRecord>
            items={safeSkills as ItemRecord[]}
            itemLabel="skill"
            ariaLabel="Skills"
            renderItemMeta={(skill) => (
              <>
                Level {skill.level} • Total XP: {skill.total_xp} • Total time: {skill.total_time} • Records: {skill.total_records}
              </>
            )}
            renderEditSummary={(skill) => (
              <>
                Level {skill.level} • Total XP: {skill.total_xp} • Total time: {skill.total_time} • Records: {skill.total_records}
              </>
            )}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        </div>
      ) : (
        <div className={styles.emptyState}>
          <p>No skills yet.</p>
        </div>
      )}
    </div>
  );
}
