import React, { useEffect, useState } from "react";
import { useGame } from "../../hooks/useGame";
import { useToast } from "../../hooks/useToast";
import Button from "../Button/Button";
import ButtonFrame from "../Button/ButtonFrame";
import Input from "../Input/Input";

import { formatDuration } from "../../utils/formatUtils";
import { buildActivityRewardToastMessage } from "../../utils/activityRewardToast";
import TimerDisplay from "./TimerDisplay";
import styles from "./ActivityTimer.module.scss";

import { useUpdateActivity } from "../../hooks/useActivities";

export function ActivityTimer() {
  const [activityName, setActivityName] = useState("");
  const handleInputChange = (value: string | boolean) => {
    if (typeof value === "string") setActivityName(value);
  };

  const {
    fetchActivities,
    setPlayer,
    activityTimer,
  } = useGame();
  const { showToast } = useToast();

  const {
    currentActivity: activity,
    status,
    elapsed,
    startActivity,
    stop,
    autoStopCompletion,
    clearAutoStopCompletion,
  } = activityTimer;
  const resolvedActivityName = activityName || activity?.name || "";
  const selectedTaskId: number | null = activity?.taskId ?? null;

  const displayTime = formatDuration(elapsed);

  const updateActivity = useUpdateActivity();

  // Surfaces the auto-stop-triggered completion (timer hit its limit) the
  // same way a manual submit does, since it never goes through
  // handleSubmitActivity below.
  useEffect(() => {
    if (!autoStopCompletion) return;

    const message = buildActivityRewardToastMessage(autoStopCompletion.xpGained, autoStopCompletion.levelUps);
    if (message) showToast(message);
    clearAutoStopCompletion();
  }, [autoStopCompletion, clearAutoStopCompletion, showToast]);

  const handleSubmitActivity = async () => {
    try {
      if (activity?.id) {
        await updateActivity.mutateAsync({
          activityId: activity.id,
          data: { name: resolvedActivityName },
        });
      }

      const result = await stop();

      // `profile` is a legacy field that may be returned by older backend versions.
      // The typed ActivityCompleteResponse does not declare it, so we access it loosely.
      const resultRaw = result as (typeof result & { profile?: Parameters<typeof setPlayer>[0] });
      if (resultRaw?.profile) setPlayer(resultRaw.profile);

      const message = buildActivityRewardToastMessage(result?.xp_gained, result?.level_ups);
      if (message) showToast(message);

      fetchActivities();
      setActivityName("");
    } catch (err) {
      console.error(err);
      showToast("Something went wrong. Please try again.");
    }
  };

  return (
    <section className={styles.activityRow}>
      <TimerDisplay label="Activity" status={status} time={displayTime} />

      <Input
        id="activity-input"
        label="Activity"
        value={resolvedActivityName}
        onChange={handleInputChange}
        placeholder="Enter activity"
      />

      <ButtonFrame>
        <Button
          onClick={() =>
            startActivity({
              text: resolvedActivityName,
              taskId: selectedTaskId,
            })
          }
          disabled={status !== "empty"}
        >
          Start Activity
        </Button>

        <Button onClick={handleSubmitActivity} disabled={status === "empty"}>
          Submit Activity
        </Button>
      </ButtonFrame>
    </section>
  );
}
