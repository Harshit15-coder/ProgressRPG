// hooks/useSupportFlow.ts
// Hook that manages SupportFlow modal state and exposes a clean API to callers.
//
// Usage:
//   const { openWelcomeMessage, openActivityReward, flowState, flowDispatch, handleConfirmActivity }
//     = useSupportFlow({ onStartActivity });
//
// Then render <SupportFlowModal state={flowState} dispatch={flowDispatch} onConfirmActivity={handleConfirmActivity} />

import { useReducer, useCallback, useRef, useEffect } from "react";
import type { Dispatch } from "react";
import { supportFlowReducer } from "../components/SupportFlow/supportFlowReducer";
import type { FlowAction, FlowState } from "../components/SupportFlow/supportFlowTypes";

interface OpenActivityRewardOptions {
  xpGained?: number | null;
  activityName?: string | null;
  elapsedSeconds?: number | null;
  baseXp?: number | null;
  xpMultiplier?: number | null;
  taskXpMultiplier?: number | null;
  levelUps?: number[];
  isAutoStopped?: boolean;
  showUpgradePrompt?: boolean;
  taskId?: number | null;
}

interface OpenWelcomeMessageOptions {
  loginState?: string;
  loginStreak?: number;
  loginRewardXp?: number;
}

interface SupportFlowOptions {
  /** Invoked when the user confirms an activity in the modal. */
  onStartActivity?: (payload: { activityText: string; durationSeconds: number | null; taskId?: number | null }) => boolean | void | Promise<boolean | void>;
}

/**
 * @param options.onStartActivity
 *   Callback invoked when the user confirms an activity in the modal.
 *   The parent should wire this to startActivity({ text, limitSeconds }).
 */
export function useSupportFlow({ onStartActivity }: SupportFlowOptions = {}) {
  const [flowState, flowDispatch] = useReducer(
    // The reducer uses loose internal types; cast via unknown to the typed signature.
    supportFlowReducer as unknown as (state: FlowState, action: FlowAction) => FlowState,
    { isOpen: false } as FlowState
  );

  // Keep a ref to the latest flowState so handleConfirmActivity doesn't
  // get recreated on every keystroke in the activity text input.
  const flowStateRef = useRef<FlowState>(flowState);
  useEffect(() => { flowStateRef.current = flowState; }, [flowState]);

  const openWelcomeMessage = useCallback(({ loginState = "none", loginStreak = 0, loginRewardXp = 0 }: OpenWelcomeMessageOptions = {}): void => {
    flowDispatch({ type: "OPEN_WELCOME_MESSAGE", loginState, loginStreak, loginRewardXp });
  }, []);

  const openActivityReward = useCallback(
    ({
      xpGained = null,
      activityName = null,
      elapsedSeconds = null,
      baseXp = null,
      xpMultiplier = null,
      taskXpMultiplier = null,
      levelUps = [],
      isAutoStopped = false,
      showUpgradePrompt = false,
      taskId = null,
    }: OpenActivityRewardOptions = {}): void => {
      flowDispatch({
        type: "OPEN_ACTIVITY_REWARD",
        xpGained,
        activityName,
        elapsedSeconds,
        baseXp,
        xpMultiplier,
        taskXpMultiplier,
        levelUps,
        isAutoStopped,
        showUpgradePrompt,
        taskId,
      });
    },
    []
  );

  const openSupportMode = useCallback((): void => {
    flowDispatch({ type: "OPEN_SUPPORT_MODE" });
  }, []);

  const handleConfirmActivity = useCallback(async (activityTextOverride: string | null = null, taskId?: number | null): Promise<void> => {
    const state = flowStateRef.current;
    if (!state.isOpen) return;
    const { activityText = "", durationSeconds = null } = state.ctx;
    const finalActivityText =
      typeof activityTextOverride === "string"
        ? activityTextOverride
        : activityText;
    const result = await onStartActivity?.({ activityText: finalActivityText, durationSeconds, taskId });
    if (result === false) return;
    flowDispatch({ type: "CLOSE" });
  }, [onStartActivity]);

  return {
    openWelcomeMessage,
    openActivityReward,
    openSupportMode,
    flowState,
    flowDispatch: flowDispatch as Dispatch<FlowAction>,
    handleConfirmActivity,
  };
}
