import styles from "./Achievements.module.scss";
import { achievementProgress, formatAchievementValue, tierClassName } from "./achievementUtils";

interface Achievement {
  type: string;
  label: string;
  symbol?: string;
  tier: number;
  complete: boolean;
  color?: string;
  value: number;
  threshold: number;
  next_threshold?: number | null;
}

interface AchievementsProps {
  achievements?: Achievement[];
}

export default function Achievements({ achievements = [] }: AchievementsProps) {
  const normalizedAchievements = Array.isArray(achievements) ? achievements : [];

  return (
    <section className={styles.section}>
      <h2>Achievements</h2>
      <div className={styles.achievementGrid}>
        {normalizedAchievements.map((achievement) => {
          const progress = achievementProgress(achievement);
          const valueLabel = formatAchievementValue(
            achievement.type,
            achievement.value
          );
          const thresholdLabel = formatAchievementValue(
            achievement.type,
            achievement.threshold
          );

          return (
            <article
              className={`${styles.achievementBadge} ${tierClassName(styles, achievement.color)} ${
                achievement.complete ? styles.achievementComplete : ""
              }`}
              key={achievement.type}
            >
              <div className={styles.achievementHeader}>
                <span className={styles.achievementSymbol} aria-hidden="true">
                  {achievement.symbol}
                </span>
                <div>
                  <h3>{achievement.label}</h3>
                  <p>Tier {achievement.tier}</p>
                </div>
              </div>
              <div className={styles.achievementProgress}>
                <span>
                  {achievement.complete
                    ? "Complete"
                    : `${valueLabel} / ${thresholdLabel}`}
                </span>
                <span>{achievement.complete ? "Max tier" : `${progress}%`}</span>
              </div>
              <div className={styles.progressTrack} aria-hidden="true">
                <span style={{ width: `${achievement.complete ? 100 : progress}%` }} />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
