import React from "react";
import GameSection from "../GameSection";
import ActivityPanel from "./ActivityPanel";
import { ActivityTimer } from "../../../components/Timer/ActivityTimer";
import { useGame } from "../../../context/GameContext";

// `onboardingStage` is a legacy field not yet in the typed GameContextValue.
// It will be added when GameContext is updated in a later migration step.
interface LegacyGameContext {
  onboardingStage?: number;
}

export default function ActivitySection() {
  const { onboardingStage } = useGame() as unknown as LegacyGameContext;

  return (
    <GameSection type="Activity">
      <ActivityTimer />

      {(onboardingStage ?? 0) >= 2 && <ActivityPanel />}
    </GameSection>
  );
}
