// layout/GameContainer/QuestModal/QuestModal.tsx
import React, { useState } from "react";
import QuestList from "./QuestList/QuestList";
import QuestDetail from "./QuestDetail/QuestDetail";
import { useGame } from "../../../context/GameContext";
import Modal from "../../../components/Modal/Modal";

import type { Quest } from "../../../types";

// `quests` is a legacy field not yet in the typed GameContextValue.
// It will be added when GameContext is updated in a later migration step.
interface LegacyGameContext {
  quests?: Quest[];
}

interface QuestModalProps {
  onClose: () => void;
  onChooseQuest?: (quest: Quest, duration: number) => void;
}

export default function QuestModal({ onClose, onChooseQuest }: QuestModalProps) {
  const { quests } = useGame() as unknown as LegacyGameContext;
  const [selectedQuest, setSelectedQuest] = useState<Quest | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);

  const handleViewQuest = (quest: Quest) => {
    setSelectedQuest(quest);
    setSelectedDuration(quest.duration_choices?.[0] ?? null);
  };

  const handleChooseQuest = () => {
    if (!selectedQuest || !selectedDuration) return;
    onChooseQuest?.(selectedQuest, selectedDuration);
    onClose();
  };

  return (
    <Modal title="Choose your quest" onClose={onClose}>
      <QuestList
        quests={quests}
        selectedQuest={selectedQuest}
        onSelect={handleViewQuest}
      />
      <QuestDetail
        quest={selectedQuest}
        selectedDuration={selectedDuration}
        onDurationChange={setSelectedDuration}
        onChoose={handleChooseQuest}
      />
    </Modal>
  );
}
