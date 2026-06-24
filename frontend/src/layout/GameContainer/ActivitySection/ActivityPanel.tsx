import React from "react";
import List from "../../../components/List/List";
import styles from "./ActivityPanel.module.scss";
import { useGame } from "../../../context/GameContext";
import { formatDuration } from "../../../utils/formatUtils";
import type { PlayerActivity } from "../../../types";

// `activities` (paginated) is a legacy field not yet in the typed GameContextValue.
// It will be added when GameContext is updated in a later migration step.
interface LegacyActivitiesContext {
  activities?: {
    results?: PlayerActivity[];
    count?: number;
  };
}

export default function ActivityPanel() {
  const gameCtx = useGame();
  const { activities } = gameCtx as unknown as LegacyActivitiesContext;
  const totalDuration =
    activities?.results?.reduce((acc, a) => acc + a.duration, 0) ?? 0;
  const count = activities?.count ?? 0;

  return (
    <section className={styles.listSection}>
      <h2>Today's activities</h2>

      <div className={styles.row}>
        <div className={styles.activityTotals}>
          <span>{formatDuration(totalDuration)}</span>
          <span>time and</span>
          <span>{count}</span>
          <span>activities logged today</span>
        </div>
      </div>

      {count === 0 ? (
        <p>No activities completed today...so far!</p>
      ) : (
        <List
          items={(activities?.results ?? []) as (PlayerActivity & { [key: string]: unknown })[]}
          renderItem={(act) => (
            <div>
              {act.name as string} – {formatDuration(act.duration as number)}
            </div>
          )}
          className={styles.list}
        />
      )}
    </section>
  );
}
