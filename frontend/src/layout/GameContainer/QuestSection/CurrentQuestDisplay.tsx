import React from "react";
import styles from "./CurrentQuestDisplay.module.scss";
import type { Quest } from "../../../types";

interface CurrentQuestDisplayProps {
  quest?: Quest | null;
}

export default function CurrentQuestDisplay({ quest }: CurrentQuestDisplayProps) {
  const title = quest?.name ?? "None";
  const intro = quest?.intro_text ?? "No active quest yet...";
  const outro = quest?.outro_text ?? "";

  return (
    <div className={styles.currentQuestSection}>
      <p className={`${styles.questText} ${styles.questLabel}`}>
        Current quest:{" "}
        <span className={styles.currentQuestTitle}>{title}</span>
      </p>
      <p className={styles.questText}>{intro}</p>
      {outro && <p className={styles.questText}>{outro}</p>}
    </div>
  );
}
