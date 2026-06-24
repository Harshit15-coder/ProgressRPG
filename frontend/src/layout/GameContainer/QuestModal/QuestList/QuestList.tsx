import React from "react";
import styles from "./QuestList.module.scss";
import List from "../../../../components/List/List";
import type { Quest } from "../../../../types";

interface QuestListProps {
  quests?: Quest[];
  selectedQuest?: Quest | null;
  onSelect?: (quest: Quest) => void;
}

// Extend Quest to satisfy List's generic constraint
type QuestListItem = Quest & { [key: string]: unknown };

export default function QuestList({
  quests,
  selectedQuest,
  onSelect,
}: QuestListProps) {
  const items = (quests ?? []) as QuestListItem[];
  const selected = (selectedQuest ?? null) as QuestListItem | null;

  return (
    <div className={styles.questList}>
      <List
        items={items}
        selectable
        selectedItem={selected}
        onSelect={onSelect as ((item: QuestListItem) => void) | undefined}
        getKey={(quest) => (quest.id ?? quest.name) as string | number}
        renderItem={(quest) => <>{quest.name as string}</>}
      />
    </div>
  );
}
