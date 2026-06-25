import React from "react";
import styles from "./Infobox.module.scss";
import ProgressBar from "../../../components/ProgressBar/ProgressBar";
import type { Player, Character } from "../../../types";

type InfoboxData = Player | Character;

interface InfoRow {
  label: string;
  value: string | number | undefined;
}

function getRows(data: InfoboxData | null | undefined, type: string): InfoRow[] {
  if (!data) return [];

  if (type === "player") {
    const p = data as Player;
    return [
      { label: "Player", value: p.name },
      { label: "Level", value: p.level },
    ];
  }

  if (type === "character") {
    const c = data as Character;
    return [
      { label: "Character", value: c.first_name },
      { label: "Level", value: c.level },
    ];
  }

  return [];
}

function getCustomClasses(label: string): {
  labelClass: string;
  valueClass: string;
} {
  switch (label.toLowerCase()) {
    case "level":
      return { labelClass: styles.levelLabel, valueClass: styles.levelValue };
    case "xp":
      return { labelClass: styles.xpLabel, valueClass: styles.xpValue };
    case "player":
    case "character":
      return { labelClass: styles.nameLabel, valueClass: styles.nameValue };
    default:
      return { labelClass: "", valueClass: "" };
  }
}

interface InfoboxProps {
  title?: string;
  type: string;
  data: InfoboxData;
}

export default function Infobox({ title, type, data }: InfoboxProps) {
  const rows = getRows(data, type);
  // Access xp/xp_next_level — both Player and Character have these fields
  const xp = (data as { xp?: number }).xp ?? 0;
  const xpNextLevel = (data as { xp_next_level?: number }).xp_next_level ?? 0;

  return (
    <div className={styles.infoBox}>
      {title && <div className={styles.title}>{title}</div>}
      <div className={styles.columns}>
        <div className={styles.column}>
          {rows.map(({ label, value }, i) => {
            const { labelClass, valueClass } = getCustomClasses(label);
            return (
              <div key={i} className={styles.row}>
                <span className={`${styles.label} ${labelClass}`}>{label}:</span>
                <span className={`${styles.value} ${valueClass}`}>{value}</span>
              </div>
            );
          })}
          <ProgressBar
            value={xp}
            max={xpNextLevel}
            label={`XP: ${xp} / ${xpNextLevel}`}
            color="xp"
          />
        </div>
        <div className={styles.column}></div>
      </div>
    </div>
  );
}
