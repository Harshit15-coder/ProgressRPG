import React, { useState } from "react";
import { useGame } from "../../hooks/useGame";
import Button from "../Button/Button";
import ButtonFrame from "../Button/ButtonFrame";
import Input from "../Input/Input";

import { formatDuration } from "../../utils/formatUtils";
import TimerDisplay from "./TimerDisplay";
import styles from "./ActivityTimer.module.scss";

import { useUpdateActivity } from "../../hooks/useActivities";

// GameContext does not yet expose showToast in its typed interface — access via
// loose cast until the context is updated.
interface LooseGameContext {
  showToast?: (title: string, err?: unknown) => void;
}

export function ActivityTimer() {
  const [activityName, setActivityName] = useState("");
  const handleInputChange = (value: string | boolean) => {
    if (typeof value === "string") setActivityName(value);
  };

  const gameCtx = useGame();
  const {
    fetchActivities,
    setPlayer,
    activityTimer,
  } = gameCtx;
  // showToast is not yet in the typed GameContextValue — cast to access it
  const { showToast } = gameCtx as unknown as LooseGameContext;

  const {
    currentActivity: activity,
    status,
    elapsed,
    startActivity,
    stop,
  } = activityTimer;
  const resolvedActivityName = activityName || activity?.name || "";
  const selectedTaskId: number | null = activity?.taskId ?? null;

  const displayTime = formatDuration(elapsed);

  const updateActivity = useUpdateActivity();

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
      fetchActivities();
      setActivityName("");
    } catch (err) {
      if (typeof showToast === "function") {
        showToast("Something went wrong", err);
      } else {
        console.error(err);
      }
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
