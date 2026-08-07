import React from "react";
import List from "../List/List";
import styles from "./PopulationCentreResidents.module.scss";
import type { Character } from "../../types";

interface PopulationCentreResidentsProps {
  residents?: Character[];
  linkedCharacterId?: number | null;
}

const formatActivity = (activity: string | null | undefined): string => {
  // current_activity is already narrative/present-tense from the backend
  // (ActivityDefinition.narrative, e.g. "delivering goods to neighbours") -
  // no further casing needed here.
  return activity || "idle";
};

const formatName = (firstName: string | undefined, lastName: string | undefined): string => {
  const name = `${firstName || ""} ${lastName || ""}`.trim();
  return name || "Unknown";
};

export default function PopulationCentreResidents({
  residents = [],
  linkedCharacterId,
}: PopulationCentreResidentsProps) {
  const sortedResidents = [...residents].sort((left, right) => {
    const leftLinked = left?.id === linkedCharacterId;
    const rightLinked = right?.id === linkedCharacterId;

    if (leftLinked && !rightLinked) return -1;
    if (!leftLinked && rightLinked) return 1;

    const leftLast = String(left?.last_name || "").toLowerCase();
    const rightLast = String(right?.last_name || "").toLowerCase();

    if (leftLast < rightLast) return -1;
    if (leftLast > rightLast) return 1;

    const leftAge = Number.isFinite(left?.age) ? left.age : -1;
    const rightAge = Number.isFinite(right?.age) ? right.age : -1;

    return rightAge - leftAge;
  });

  if (!Array.isArray(residents) || residents.length === 0) {
    return (
      <section className={styles.section}>
        <h2 className={styles.heading}>Residents</h2>
        <p className={styles.empty}>No residents found.</p>
      </section>
    );
  }

  // Cast to satisfy List's generic constraint (requires [key: string]: unknown)
  type ResidentListItem = Character & { [key: string]: unknown };
  const listItems = sortedResidents as ResidentListItem[];

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>Residents</h2>
      <List
        items={listItems}
        className={styles.list}
        getKey={(resident) =>
          resident.id ?? `${resident.first_name}-${resident.last_name}`
        }
        getItemClassName={(resident) =>
          `${styles.item} ${resident.id === linkedCharacterId ? styles.linked : ""}`
        }
        renderItem={(resident) => {
          const name = formatName(
            resident.first_name as string | undefined,
            resident.last_name as string | undefined
          );
          const age = resident.age ?? "Unknown";
          const activity = formatActivity(resident.current_activity as string | null | undefined);
          const linkedText = !resident.is_npc
            ? resident.id === linkedCharacterId
              ? "Linked to you"
              : "Linked"
            : "";

          return (
            <span className={styles.line}>
              <span className={styles.lineText}>
                {name} ({String(age)}) is {activity}
              </span>
              {linkedText && (
                <span className={styles.linkedText}>{linkedText}</span>
              )}
            </span>
          );
        }}
      />
    </section>
  );
}
