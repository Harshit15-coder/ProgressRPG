import React, { useMemo, useEffect } from "react";
import { useGame } from "../../context/GameContext";
import List from "../List/List";
import styles from "./ActivityTimeline.module.scss";
import type { PlayerActivity, CharacterActivity } from "../../types";

// Unified activity type used in the timeline list.
// The index signature is required by the List component's generic constraint.
type UnifiedActivity = (PlayerActivity | CharacterActivity) & {
  // CharacterActivity has kind; PlayerActivity has player
  kind?: string;
  [key: string]: unknown;
};

// Helper to format duration nicely
const formatDuration = (seconds: number): string => {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
};

export default function ActivityTimeline() {
  const {
    playerActivities,
    characterActivities,
    fetchActivities,
    player,
    freeTimerLimitSeconds,
    activityTimer,
    loading,
  } = useGame();

  const isPremium = Boolean(player?.is_premium);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  const unifiedActivities = useMemo((): UnifiedActivity[] => {
    const combined = [...playerActivities, ...characterActivities].sort(
      (a, b) => {
        const at = a.completed_at ? new Date(a.completed_at).getTime() : 0;
        const bt = b.completed_at ? new Date(b.completed_at).getTime() : 0;
        return bt - at;
      }
    );
    return combined as UnifiedActivity[];
  }, [playerActivities, characterActivities]);

  const hasAny = unifiedActivities.length > 0;

  if (loading) {
    return (
      <div className={styles.infoBar} role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">Loading data...</span>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h3 className={styles.heading}>
        Recent activities
      </h3>

      {!hasAny && (
        <p>No activities found for this period.</p>
      )}

      {hasAny && (
        <List
          items={unifiedActivities}
          getKey={(act, i) => `${'player' in act ? 'player' : 'character'}-${act.id ?? i}`}
          getItemClassName={() => styles.activityLineItem}
          renderItem={(act) => (
            <div className={styles.line}>
              <span className={styles.lineText}>
                <strong>{act.name || act.kind || "an activity"}</strong> —{" "}
                {formatDuration(act.duration)}
              </span>
              <button
                type="button"
                className={styles.playButton}
                onClick={async (event) => {
                  event.currentTarget.blur();

                  const activityText = (act.name || act.kind || "").trim();
                  if (!activityText) return;
                  if (activityTimer?.status === "active") return;

                  await activityTimer?.startActivity({
                    text: activityText,
                    limitSeconds: isPremium ? null : freeTimerLimitSeconds,
                  });
                }}
                aria-label={`Restart ${act.name || act.kind || "activity"}`}
                title="Do this activity again"
              >
                ▷
              </button>
            </div>
          )}
        />
      )}
    </div>
  );
}
