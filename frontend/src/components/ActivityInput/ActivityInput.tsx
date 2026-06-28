import React, { useEffect, useRef, useState } from "react";
import classNames from "classnames";
import { useQueryClient } from "@tanstack/react-query";
import { useGame } from "../../context/GameContext";
import Button from "../Button/Button";
import EntitySearchInput from "../EntitySearchInput/EntitySearchInput";
import { useEntitySearchCache } from "../../hooks/useEntitySearchCache";
import styles from "./ActivityInput.module.scss";
import { useSupportFlow } from "../../hooks/useSupportFlow";
import SupportFlowModal from "../SupportFlow/SupportFlowModal";
import { playLimitReachedSound, primeAudio } from "../../utils/sounds";

const WELCOME_MESSAGE_LAST_EVENT_KEY = "supportFlow_lastLoginEventAtShown";

// Shape of a selected entity from EntitySearchInput
interface SelectedEntity {
  name: string;
  id?: number | string | null;
  taskId?: number | null;
  source?: string;
  [key: string]: unknown;
}

export default function ActivityInput() {
  const {
    activityTimer,
    fetchPlayerAndCharacter,
    fetchCharacterCurrent,
    fetchActivities,
    loginState,
    loginStreak,
    loginEventAt,
    loginRewardXp,
    player,
    freeTimerLimitSeconds,
  } = useGame();
  const {
    currentActivity,
    status,
    stop,
    startActivity,
    elapsed,
    limitSeconds,
    autoStopCompletion,
    clearAutoStopCompletion,
  } = activityTimer;

  const isPremium = Boolean(player?.is_premium);
  const queryClient = useQueryClient();
  const { addEntityToCache } = useEntitySearchCache("activity");

  const [name, setName] = useState("");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isActive = status === "active";
  const inputValue = isActive
    ? (name || currentActivity?.name || "")
    : name;

  const {
    openWelcomeMessage,
    openActivityReward,
    openSupportMode,
    flowState,
    flowDispatch,
    handleConfirmActivity,
  } = useSupportFlow({
    onStartActivity: ({ activityText, durationSeconds }) => {
      const parsedDuration = Number(durationSeconds);
      const hasCustomDuration = Number.isFinite(parsedDuration) && parsedDuration > 0;

      let resolvedLimitSeconds: number | null = null;
      let limitReason: string | null = null;

      if (isPremium) {
        resolvedLimitSeconds = hasCustomDuration ? parsedDuration : null;
      } else if (!hasCustomDuration) {
        resolvedLimitSeconds = freeTimerLimitSeconds;
        limitReason = "free_limit";
      } else if (parsedDuration > freeTimerLimitSeconds) {
        resolvedLimitSeconds = freeTimerLimitSeconds;
        limitReason = "free_limit";
      } else {
        resolvedLimitSeconds = parsedDuration;
        limitReason = "preset_limit";
      }

      startActivity({ text: activityText, limitSeconds: resolvedLimitSeconds, limitReason });
    },
  });

  useEffect(() => {
    if (loginState === "none" || !loginEventAt) return;

    let lastShownEventAt: string | null = null;
    try {
      lastShownEventAt = sessionStorage.getItem(WELCOME_MESSAGE_LAST_EVENT_KEY);
    } catch {
      // If sessionStorage is unavailable, fall back to opening the modal.
    }

    if (lastShownEventAt === loginEventAt) return;

    openWelcomeMessage({ loginState, loginStreak, loginRewardXp });

    try {
      sessionStorage.setItem(WELCOME_MESSAGE_LAST_EVENT_KEY, loginEventAt);
    } catch {
      // Ignore storage failures and keep app flow functional.
    }
  }, [loginState, loginStreak, loginEventAt, loginRewardXp, openWelcomeMessage]);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  useEffect(() => {
    if (isActive) (document.activeElement as HTMLElement | null)?.blur();
  }, [isActive]);

  useEffect(() => {
    if (!autoStopCompletion) return;

    let cancelled = false;

    // Capture non-null reference — the if(!autoStopCompletion) guard above ensures this
    const completion = autoStopCompletion!;

    async function handleAutoStopCompletion() {
      setName("");

      try {
        await Promise.all([
          fetchPlayerAndCharacter(),
          fetchCharacterCurrent(),
          fetchActivities(),
        ]);
      } catch (err) {
        console.error("[ActivityInput] Failed to refresh after auto-stop:", err);
      }

      if (cancelled) return;

      playLimitReachedSound();

      const isFreeLimitAutoStop = completion.stopReason === "free_limit";

      openActivityReward({
        xpGained: completion.xpGained,
        baseXp: completion.baseXp,
        xpMultiplier: completion.xpMultiplier,
        levelUps: completion.levelUps,
        isAutoStopped: true,
        showUpgradePrompt: !isPremium && isFreeLimitAutoStop,
        activityName: completion.activityName,
        elapsedSeconds: completion.elapsedSeconds,
      });
      clearAutoStopCompletion();
    }

    handleAutoStopCompletion();

    return () => {
      cancelled = true;
    };
  }, [
    autoStopCompletion,
    clearAutoStopCompletion,
    fetchPlayerAndCharacter,
    fetchActivities,
    fetchCharacterCurrent,
    isPremium,
    openActivityReward,
  ]);

  async function handleToggle() {
    primeAudio(); // unlock AudioContext while still in user-gesture context
    if (isActive) {
      const completedActivityName = (name || currentActivity?.name || "").trim();
      const completedTaskId = currentActivity?.taskId ?? null;
      const localElapsed = elapsed; // capture before async operations clear it

      let completion: Awaited<ReturnType<typeof stop>> = null;
      try {
        completion = await stop({ activityName: completedActivityName });
      } catch (err) {
        console.error("[ActivityInput] Failed to stop timer:", err);
        // Continue — play sound and show popup with local data so the user isn't left hanging
      }


      // completion comes back as ActivityCompleteResponse or null — fields use snake_case from API
      const completionRaw = completion as Record<string, unknown> | null;
      const xpGained = completionRaw?.xp_gained != null ? Number(completionRaw.xp_gained) : null;
      const baseXp = completionRaw?.base_xp != null ? Number(completionRaw.base_xp) : null;
      const xpMultiplier = completionRaw?.xp_multiplier != null ? Number(completionRaw.xp_multiplier) : null;
      const levelUps = Array.isArray(completionRaw?.level_ups) ? completionRaw.level_ups as number[] : [];
      const elapsedSeconds = completionRaw?.duration_seconds != null
        ? Number(completionRaw.duration_seconds)
        : localElapsed;
      setName("");

      try {
        await Promise.all([
          fetchPlayerAndCharacter(),
          fetchCharacterCurrent(),
          fetchActivities(),
          completedTaskId ? queryClient.invalidateQueries({ queryKey: ["tasks"] }) : Promise.resolve(),
        ]);
      } catch (err) {
        console.error("[ActivityInput] Failed to refresh after stop:", err);
      }


      playLimitReachedSound();
      openActivityReward({
        xpGained,
        baseXp,
        xpMultiplier,
        levelUps,
        isAutoStopped: false,
        showUpgradePrompt: !isPremium,
        activityName: completedActivityName || null,
        elapsedSeconds,
        taskId: completedTaskId,
      });
      return;
    }

    if (!name.trim()) return;
    addEntityToCache(name.trim());
    await startActivity({ text: name.trim(), limitSeconds: isPremium ? null : freeTimerLimitSeconds });
  }

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const formattedLimit =
    typeof limitSeconds === "number" && limitSeconds > 0
      ? `${Math.floor(limitSeconds / 60)}:${(limitSeconds % 60)
          .toString()
          .padStart(2, "0")}`
      : null;
  const warningThresholdSeconds =
    typeof limitSeconds === "number" && limitSeconds > 0
      ? limitSeconds * 0.9
      : null;
  const showAutoStopWarning =
    isActive &&
    typeof limitSeconds === "number" &&
    limitSeconds > 0 &&
    warningThresholdSeconds !== null &&
    elapsed >= warningThresholdSeconds &&
    elapsed < limitSeconds;

  const resolveSelectedTaskId = (entity: SelectedEntity): number | null => {
    if (entity?.source !== "task") return null;

    if (entity?.taskId !== null && entity?.taskId !== undefined) {
      return entity.taskId;
    }

    // Fallback for legacy cached task entities that may only carry id.
    if (typeof entity?.id === "number") {
      return entity.id;
    }

    if (typeof entity?.id === "string" && /^\d+$/.test(entity.id)) {
      return parseInt(entity.id, 10);
    }

    return null;
  };

  return (
    <>
      <div className={styles.containerOuter}>
        <div
          className={classNames(styles.container, {
            [styles.isRunning]: isActive,
            [styles.needsAttention]: !isActive,
          })}
        >
          <div className={styles.row}>
            <div className={classNames(styles.grow, styles.control)}>
              <EntitySearchInput
                type="activity"
                value={inputValue}
                onChange={setName}
                onSelect={async (activity) => {
                  setName(activity.name);
                  // SearchEntity and addEntityToCache's input type differ slightly;
                  // cast via Partial<PlayerActivity> since both share name/id fields.
                  addEntityToCache(activity as unknown as Partial<import("../../types").PlayerActivity>);
                  await startActivity({
                    text: activity.name,
                    taskId: resolveSelectedTaskId(activity as SelectedEntity),
                    limitSeconds: isPremium ? null : freeTimerLimitSeconds,
                  });
                }}
                onCreate={async (activityName) => {
                  setName(activityName);
                  addEntityToCache(activityName);
                  await startActivity({
                    text: activityName,
                    limitSeconds: isPremium ? null : freeTimerLimitSeconds,
                  });
                }}
                placeholder="What are you working on? e.g. washing dishes"
                ariaLabel="Activity name"
                className={styles.entitySearch}
                inputClassName={classNames(styles.inputText, {
                  [styles.inputCTA]: !isActive,
                  [styles.inputMuted]: isActive,
                })}
                searchEnabled={!isActive}
              />
            </div>

            <div className={classNames(styles.timerPill, styles.control)}>
              {minutes}:{seconds.toString().padStart(2, "0")}
            </div>

            <Button
              onClick={handleToggle}
              variant="primary"
              disabled={!isActive && !name.trim()}
              className={classNames(styles.ctaButton, styles.control)}
            >
              {isActive ? "Stop" : "Start"}
            </Button>
          </div>

        </div>

        {showAutoStopWarning && (
          <p className={styles.limitWarning}>
            This timer will stop automatically when it reaches {formattedLimit}.
          </p>
        )}

        <div className={styles.supportButtonRow}>
          <Button
            onClick={openSupportMode}
            variant="secondary"
            className={styles.supportModeButton}
            ariaLabel="Open support mode"
          >
            Need support?
          </Button>
        </div>

      </div>

      <SupportFlowModal
        state={flowState}
        dispatch={flowDispatch}
        onConfirmActivity={handleConfirmActivity}
      />
    </>
  );
}
