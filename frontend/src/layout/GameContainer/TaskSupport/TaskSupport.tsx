"use client";

import React, { useState } from "react";
import Modal from "../../../components/Modal/Modal";
import Button from "../../../components/Button/Button";
import ButtonFrame from "../../../components/Button/ButtonFrame";
import { useGame } from "../../../context/GameContext";
import type { Quest } from "../../../types";

// `quests` is a legacy field not yet in the typed GameContextValue.
// It will be added when GameContext is updated in a later migration step.
interface LegacyGameContext {
  quests?: Quest[];
}

type ModalState = "welcome" | "walkthrough" | "suggestion" | "postQuest";

interface TaskSupportModalProps {
  onClose?: () => void;
  onChooseQuest?: (quest: Quest, duration: number) => void;
  onStartSupport?: () => void;
  onFinishSupport?: () => void;
  taskSupportActive?: boolean;
  lastDuration?: number | null;
  setLastDuration?: (duration: number) => void;
}

const suggestions: Record<string, string> = {
  start: "Pick the smallest possible step.",
  anxious: "Try a calming quest (breathing, stretching, or step outside).",
  tired: "Commit to 5 minutes only.",
  failure: "Do a deliberately bad version to fight perfectionism.",
};

const backMap: Partial<Record<ModalState, ModalState>> = {
  walkthrough: "welcome",
  suggestion: "walkthrough",
  postQuest: "welcome",
};

export default function TaskSupportModal({
  onClose,
  onChooseQuest,
  onStartSupport,
  onFinishSupport,
  taskSupportActive,
  lastDuration,
  setLastDuration,
}: TaskSupportModalProps) {
  const [modalState, setModalState] = useState<ModalState>(
    () => (taskSupportActive ? "postQuest" : "welcome")
  );
  const [suggestion, setSuggestion] = useState<string | undefined>(undefined);

  const { quests } = useGame() as unknown as LegacyGameContext;

  const quest = quests?.find((q) => q.name === "Task Support Quest") ?? null;

  function startQuest(duration: number | null | undefined) {
    const chosenDuration = duration ?? lastDuration;
    if (chosenDuration != null && setLastDuration) {
      setLastDuration(chosenDuration);
    }

    if (chosenDuration == null) {
      console.warn("No duration set for quest!");
      return;
    }

    if (quest) onChooseQuest?.(quest, chosenDuration);
    onStartSupport?.();
    onClose?.();
  }

  function handleWalkthroughChoice(type: string) {
    setSuggestion(suggestions[type]);
    setModalState("suggestion");
  }

  return (
    <>
      {modalState === "welcome" && (
        <Modal title="Welcome back!" onClose={onClose}>
          <p>How would you like to begin?</p>
          <ButtonFrame>
            <Button onClick={() => startQuest(10)}>Jump straight in</Button>
            <Button onClick={() => setModalState("walkthrough")}>
              Walkthrough
            </Button>
          </ButtonFrame>
        </Modal>
      )}

      {modalState === "walkthrough" && (
        <Modal title="What's most difficult right now?" onClose={onClose}>
          <ButtonFrame>
            <Button onClick={() => handleWalkthroughChoice("start")}>
              Don't know where to start
            </Button>
            <Button onClick={() => handleWalkthroughChoice("anxious")}>
              Feel anxious
            </Button>
            <Button onClick={() => handleWalkthroughChoice("tired")}>
              Too tired
            </Button>
            <Button onClick={() => handleWalkthroughChoice("failure")}>
              Fear of failure
            </Button>
          </ButtonFrame>
        </Modal>
      )}

      {modalState === "suggestion" && (
        <Modal title="Quest Suggestion" onClose={onClose}>
          <p>{suggestion}</p>
          <div>
            {[1, 3, 5].map((d) => (
              <Button key={d} onClick={() => startQuest(d * 60)}>
                {d} min
              </Button>
            ))}
          </div>
          <Button onClick={() => setModalState(backMap[modalState] ?? "welcome")}>
            Back
          </Button>
        </Modal>
      )}

      {modalState === "postQuest" && (
        <Modal title="Quest complete!" onClose={onClose}>
          <p className="mt-2">Nice work. What do you need next?</p>
          <ButtonFrame>
            <Button onClick={() => startQuest(lastDuration)}>
              Repeat quest ({lastDuration} min)
            </Button>
            <Button onClick={() => setModalState("walkthrough")}>
              Pick another quest
            </Button>
            <Button
              onClick={() => {
                onClose?.();
                onFinishSupport?.();
              }}
            >
              Finish for now
            </Button>
          </ButtonFrame>
        </Modal>
      )}
    </>
  );
}
