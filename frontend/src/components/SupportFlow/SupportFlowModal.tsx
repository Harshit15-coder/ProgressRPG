// SupportFlow/SupportFlowModal.tsx
// Container component that routes to the correct screen based on flow state.
// Does NOT own state – the parent controls state via useSupportFlow().

import React, { useCallback } from "react";
import type { Dispatch } from "react";
import Modal from "../Modal/Modal";
import WelcomeMessageScreen from "./screens/WelcomeMessageScreen";
import ActivityRewardScreen from "./screens/ActivityRewardScreen";
import SupportMenuScreen from "./screens/SupportMenuScreen";
import ActivityMenuScreen from "./screens/ActivityMenuScreen";
import ActivityInputScreen from "./screens/ActivityInputScreen";
import NotReadyMenuScreen from "./screens/NotReadyMenuScreen";
import SupportDetailScreen from "./screens/SupportDetailScreen";
import PostSupportMenuScreen from "./screens/PostSupportMenuScreen";

// Loose flow action type — reducer handles narrowing internally
type FlowAction = { type: string; [key: string]: unknown };

// Flow context as it exists in useSupportFlow's FlowState
interface FlowCtx {
  activityText?: string;
  durationSeconds?: number | null;
  activityPresetId?: string | null;
  supportMenuOrigin?: string | null;
  supportActionId?: string | null;
  welcomeMessageLoginState?: string;
  welcomeMessageLoginStreak?: number;
  welcomeMessageRewardXp?: number;
  xpGained?: number | null;
  rewardBaseXp?: number | null;
  rewardXpMultiplier?: number | null;
  rewardLevelUps?: number[];
  rewardIsAutoStopped?: boolean;
  rewardShowUpgradePrompt?: boolean;
  completedActivityName?: string | null;
  completedActivityElapsedSeconds?: number | null;
  [key: string]: unknown;
}

export type FlowState =
  | { isOpen: false }
  | { isOpen: true; screen: string; ctx: FlowCtx };

// Screen title lookup – keeps JSX clean
const SCREEN_TITLES: Record<string, string> = {
  WELCOME_MESSAGE: "Welcome!",
  ACTIVITY_REWARD: "Activity complete!",
  SUPPORT_MENU: "How are you feeling?",
  READY_ACTIVITY_MENU: "Choose an activity",
  ACTIVITY_INPUT: "Describe your activity",
  NOT_READY_MENU: "Let's support you",
  SUPPORT_DETAIL: "Support steps",
  POST_SUPPORT_MENU: "How are you feeling now?",
};

interface SupportFlowModalProps {
  state: FlowState;
  dispatch: Dispatch<FlowAction>;
  onConfirmActivity?: (text?: string) => void | Promise<void>;
}

export default function SupportFlowModal({ state, dispatch, onConfirmActivity }: SupportFlowModalProps) {
  // Stable close reference – prevents Modal's useEffect([onClose]) from
  // re-running (and stealing focus) on every keystroke in text inputs.
  const close = useCallback(() => {
    dispatch({ type: "CLOSE" });
  }, [dispatch]);

  if (!state.isOpen) return null;

  const { screen, ctx } = state;
  const canBackToReward =
    screen === "SUPPORT_MENU" &&
    ctx.supportMenuOrigin === "reward";

  let onHeaderBack: (() => void) | null = null;
  if (canBackToReward) {
    onHeaderBack = () => dispatch({ type: "BACK_FROM_SUPPORT_MENU" });
  } else if (screen === "READY_ACTIVITY_MENU" || screen === "NOT_READY_MENU") {
    onHeaderBack = () => dispatch({ type: "GO_SUPPORT_MENU" });
  } else if (screen === "ACTIVITY_INPUT") {
    onHeaderBack = () => dispatch({ type: "READY_START" });
  }

  function renderScreen() {
    switch (screen) {
      case "WELCOME_MESSAGE":
        return (
          <WelcomeMessageScreen
            loginState={ctx.welcomeMessageLoginState}
            loginStreak={ctx.welcomeMessageLoginStreak}
            loginRewardXp={ctx.welcomeMessageRewardXp}
            onStart={close}
            onSupport={() => dispatch({ type: "GO_SUPPORT_MENU", origin: "reward" })}
          />
        );

      case "ACTIVITY_REWARD":
        return (
          <ActivityRewardScreen
            xpGained={ctx.xpGained}
            baseXp={ctx.rewardBaseXp}
            xpMultiplier={ctx.rewardXpMultiplier}
            levelUps={ctx.rewardLevelUps}
            isAutoStopped={ctx.rewardIsAutoStopped}
            showUpgradePrompt={ctx.rewardShowUpgradePrompt}
            activityName={ctx.completedActivityName}
            elapsedSeconds={ctx.completedActivityElapsedSeconds}
            enableAutoSupportCountdown={false}
            onContinue={close}
            onSupport={() => dispatch({ type: "GO_SUPPORT_MENU", origin: "reward" })}
          />
        );

      case "SUPPORT_MENU":
        return (
          <SupportMenuScreen
            onReady={() => dispatch({ type: "READY_START" })}
            onNotReady={() => dispatch({ type: "NOT_READY" })}
          />
        );

      case "READY_ACTIVITY_MENU":
        return (
          <ActivityMenuScreen
            onPickPreset={(preset) =>
              dispatch({ type: "PICK_ACTIVITY_PRESET", preset })
            }
          />
        );

      case "ACTIVITY_INPUT":
        return (
          <ActivityInputScreen
            key={(ctx.activityPresetId as string | undefined) ?? "default"}
            activityPresetId={ctx.activityPresetId}
            activityText={ctx.activityText}
            onChangeText={(text) =>
              dispatch({ type: "SET_ACTIVITY_TEXT", text })
            }
            onConfirm={onConfirmActivity}
            onConfirmWithText={(text) => onConfirmActivity?.(text)}
          />
        );

      case "NOT_READY_MENU":
        return (
          <NotReadyMenuScreen
            onPick={(id) => dispatch({ type: "PICK_SUPPORT_ACTION", id })}
          />
        );

      case "SUPPORT_DETAIL":
        return (
          <SupportDetailScreen
            supportActionId={ctx.supportActionId}
            onBackToSupportMenu={() =>
              dispatch({ type: "GO_SUPPORT_MENU", origin: "regulation" })
            }
          />
        );

      case "POST_SUPPORT_MENU":
        return (
          <PostSupportMenuScreen
            onTryTask={() => dispatch({ type: "POST_SUPPORT_TRY_TASK" })}
            onMoreSupport={() =>
              dispatch({ type: "POST_SUPPORT_MORE_SUPPORT" })
            }
          />
        );

      default:
        return null;
    }
  }

  return (
    <Modal
      id="support-flow-modal"
      title={SCREEN_TITLES[screen] ?? "Support"}
      onClose={close}
      onBack={onHeaderBack}
    >
      {renderScreen()}
    </Modal>
  );
}
