import React from "react";
import List from "../../../components/List/List";
import styles from "./QuestStagesList.module.scss";

interface QuestStagesListProps {
  stages?: unknown[];
}

export default function QuestStagesList({ stages = [] }: QuestStagesListProps) {
  return (
    <div className={`${styles.container} section-row`}>
      <p className={styles.title}>Quest stages</p>

      <div className={styles.listWrapper}>
        {stages.length === 0 ? (
          <p className={styles.noProgress}>No quest progress yet.</p>
        ) : (
          <List
            items={stages as { id?: string | number; [key: string]: unknown }[]}
            renderItem={(stage) => String(stage)}
            className={styles.list}
            sectionClass={styles.listSection}
          />
        )}
      </div>
    </div>
  );
}
