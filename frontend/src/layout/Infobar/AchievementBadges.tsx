import type { CSSProperties } from "react";
import Tooltip from "../../components/Tooltip/Tooltip";
import {
  achievementProgress,
  formatAchievementValue,
  tierClassName,
} from "../../components/Achievements/achievementUtils";
import { asArray } from "../../utils/arrayUtils";
import { AchievementGoal } from "../../types/domain";
import styles from "./AchievementBadges.module.scss";

interface AchievementBadgesProps {
  achievements?: AchievementGoal[];
}

const tooltipLabel = (achievement: AchievementGoal): string =>
  achievement.type === "level" ? "Level" : achievement.label;

export default function AchievementBadges({
  achievements = [],
}: AchievementBadgesProps) {
  const normalizedAchievements = asArray(achievements);

  if (normalizedAchievements.length === 0) {
    return null;
  }

  return (
    <div className={styles.badgeRow}>
      {normalizedAchievements.map((achievement) => {
        const label = tooltipLabel(achievement);
        const remaining = Math.max(achievement.threshold - achievement.value, 0);
        const remainingLabel = formatAchievementValue(achievement.type, remaining);
        const progressLabel = achievement.complete
          ? "Complete — max tier"
          : `${remainingLabel} to next tier`;
        const progress = achievementProgress(achievement);

        return (
          <Tooltip
            key={achievement.type}
            content={
              <div className={styles.tooltipContent}>
                <strong>{label}</strong>
                <span>{progressLabel}</span>
              </div>
            }
          >
            <button
              type="button"
              className={`${styles.badge} ${tierClassName(styles, achievement.color)} ${
                achievement.complete ? styles.badgeComplete : ""
              }`}
              style={{ "--progress": progress } as CSSProperties}
              aria-label={`${label}: ${progressLabel}`}
            >
              <span aria-hidden="true">{achievement.symbol}</span>
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
