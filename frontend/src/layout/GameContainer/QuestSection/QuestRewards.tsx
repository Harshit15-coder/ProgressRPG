import React from "react";
import List from "../../../components/List/List";
import styles from "./QuestRewards.module.scss";

interface RewardOtherItem {
  label: string;
}

interface QuestRewardsData {
  xp?: number;
  coins?: number;
  other?: RewardOtherItem[];
}

interface RewardListItem {
  id: string;
  label: string;
  value?: number;
  [key: string]: unknown;
}

interface QuestRewardsProps {
  rewards?: QuestRewardsData;
  visible?: boolean;
}

export default function QuestRewards({
  rewards = {},
  visible = false,
}: QuestRewardsProps) {
  const { xp = 0, coins = 0, other = [] } = rewards;

  if (!visible) return null;

  const items: RewardListItem[] = [
    { id: "xp", label: "XP", value: xp },
    { id: "coins", label: "Coins", value: coins },
    ...other.map((item, i) => ({ id: `other-${i}`, label: item.label })),
  ];

  const renderItem = (item: RewardListItem) => {
    if ("value" in item) {
      return (
        <>
          <span>{item.label}:</span>
          <span>{item.value}</span>
        </>
      );
    }
    return item.label;
  };

  return (
    <div className={`${styles.container} listSection`}>
      <h2 className={styles.header}>Quest rewards</h2>
      <List items={items} renderItem={renderItem} />
    </div>
  );
}
