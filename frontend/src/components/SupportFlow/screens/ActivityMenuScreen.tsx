// SupportFlow/screens/ActivityMenuScreen.tsx
import React from "react";
import Button from "../../Button/Button";
import { ACTIVITY_PRESETS } from "../supportFlowReducer";
import styles from "../SupportFlowModal.module.scss";

const ACTIVITY_PRESET_DESCRIPTIONS: Record<string, string> = {
  tiniest_step:
    "Name the tiniest first step now. The activity is writing it down, not doing it yet.",
  priority_three:
    "List your top options and choose the one that matters most, or let random decide.",
  other:
    "Name exactly what you want to do and begin with a clear single activity.",
};

interface ActivityMenuScreenProps {
  onPickPreset?: (id: string) => void;
}

export default function ActivityMenuScreen({ onPickPreset }: ActivityMenuScreenProps) {
  return (
    <div className={styles.supportOptionList}>
      <p>What would you like to do?</p>
      {Object.values(ACTIVITY_PRESETS).map((preset) => (
        <div className={styles.supportOptionRow} key={preset.id}>
          <Button onClick={() => onPickPreset?.(preset.id)}>
            {preset.label}
          </Button>
          <p className={styles.supportOptionText}>
            {ACTIVITY_PRESET_DESCRIPTIONS[preset.id] ?? preset.hint ?? preset.label}
          </p>
        </div>
      ))}
    </div>
  );
}
