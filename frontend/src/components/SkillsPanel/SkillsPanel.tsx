import React from "react";

import { useSkills, useCreateSkill, useUpdateSkill, useDeleteSkill } from "../../hooks/useSkills";
import { useSimpleCrudPanel } from "../../hooks/useSimpleCrudPanel";
import type { PlayerSkill } from "../../types";
import Input from "../Input/Input";
import Button from "../Button/Button";
import PlayerItemList from "../PlayerItemList/PlayerItemList";
import styles from "./SkillsPanel.module.scss";

const renderSkillMeta = (skill: PlayerSkill) => (
  <>
    Level {skill.level} • Total XP: {skill.total_xp} • Total time: {skill.total_time} • Records: {skill.total_records}
  </>
);

export default function SkillsPanel(): React.ReactElement | null {
  const { isLoading, items, newName, setNewName, handleCreate, handleEdit, handleDelete } = useSimpleCrudPanel<PlayerSkill>({
    useList: useSkills,
    useCreate: useCreateSkill,
    useUpdate: useUpdateSkill,
    useDelete: useDeleteSkill,
  });

  if (isLoading) return <p>Loading skills...</p>;

  return (
    <div className={styles.page}>
      <form className={styles.addSkillForm} onSubmit={handleCreate}>
        <Input
          id="new-skill-name"
          value={newName}
          onChange={(v) => setNewName(v as string)}
          placeholder="New skill name"
          className={styles.addSkillInput}
        />
        <Button type="submit">Add skill</Button>
      </form>

      {items.length > 0 ? (
        <div className={styles.skillsList}>
          <PlayerItemList<PlayerSkill>
            items={items}
            itemLabel="skill"
            ariaLabel="Skills"
            renderItemMeta={renderSkillMeta}
            renderEditSummary={renderSkillMeta}
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
