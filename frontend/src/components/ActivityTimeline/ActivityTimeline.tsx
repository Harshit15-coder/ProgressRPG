import React, { useMemo, useEffect } from "react";
import { useGame } from "../../hooks/useGame";
import { useTasks } from "../../hooks/useTasks";
import { useFeatureFlag } from "../../hooks/useFeatureFlag";
import List from "../List/List";
import Tooltip from "../Tooltip/Tooltip";
import { isCompletable } from "../../utils/completable";
import { formatDurationShort } from "../../utils/formatUtils";
import styles from "./ActivityTimeline.module.scss";
import type { PlayerActivity, CharacterActivity } from "../../types";

// Unified activity type used in the timeline list.
type UnifiedActivity = (PlayerActivity | CharacterActivity) & {
  // CharacterActivity has kind; PlayerActivity has player
  kind?: string;
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
  const hasTasksFeature = useFeatureFlag("tasksFeature");
  const { data: tasks } = useTasks({ enabled: hasTasksFeature });

  const completedTaskIds = useMemo(() => {
    if (!tasks) return new Set<number>();
    return new Set(tasks.filter(isCompletable).map(t => t.id));
  }, [tasks]);

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
          renderItem={(act) => {
            const linkedTaskId = "player" in act ? (act as PlayerActivity).task : null;
            const linkedTaskIsComplete = linkedTaskId !== null && completedTaskIds.has(linkedTaskId);
            const activityText = (act.name || act.kind || "").trim();

            return (
              <div className={styles.line}>
                <span className={styles.lineText}>
                  <strong>{act.name || act.kind || "an activity"}</strong> —{" "}
                  {formatDurationShort(act.duration)}
                </span>
                {linkedTaskIsComplete ? (
                  <Tooltip content="Task complete — activity will start unlinked">
                    <button
                      type="button"
                      className={styles.warningButton}
                      onClick={async (event) => {
                        event.currentTarget.blur();
                        if (!activityText) return;
                        if (activityTimer?.status === "active") return;
                        await activityTimer?.startActivity({
                          text: activityText,
                          taskId: null,
                          limitSeconds: isPremium ? null : freeTimerLimitSeconds,
                        });
                      }}
                      aria-label={`Restart ${act.name || act.kind || "activity"} (task complete)`}
                    >
                      ▷
                    </button>
                  </Tooltip>
                ) : (
                  <Tooltip content="Do this activity again">
                    <button
                      type="button"
                      className={styles.playButton}
                      onClick={async (event) => {
                        event.currentTarget.blur();
                        if (!activityText) return;
                        if (activityTimer?.status === "active") return;
                        await activityTimer?.startActivity({
                          text: activityText,
                          taskId: linkedTaskId,
                          limitSeconds: isPremium ? null : freeTimerLimitSeconds,
                        });
                      }}
                      aria-label={`Restart ${act.name || act.kind || "activity"}`}
                    >
                      ▷
                    </button>
                  </Tooltip>
                )}
              </div>
            );
          }}
        />
      )}
    </div>
  );
}
