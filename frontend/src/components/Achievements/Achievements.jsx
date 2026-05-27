import styles from "./Achievements.module.scss";

const formatAchievementValue = (type, value) => {
  const numericValue = Number(value) || 0;

  if (type !== "time") {
    return numericValue.toLocaleString();
  }

  const hours = Math.floor(numericValue / 3600);
  const minutes = Math.floor((numericValue % 3600) / 60);

  if (hours <= 0) {
    return `${minutes}m`;
  }

  if (minutes <= 0) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}m`;
};

const tierClassName = (color) => {
  const normalized = typeof color === "string"
    ? color.charAt(0).toUpperCase() + color.slice(1)
    : "";
  return styles[`tier${normalized}`] || styles.tierGrey;
};

export default function Achievements({ achievements = [] }) {
  const normalizedAchievements = Array.isArray(achievements) ? achievements : [];

  return (
    <section className={styles.section}>
      <h2>Achievements</h2>
      <div className={styles.achievementGrid}>
        {normalizedAchievements.map((achievement) => {
          const progress = achievement.threshold > 0
            ? Math.min(
                100,
                Math.round((achievement.value / achievement.threshold) * 100)
              )
            : 0;
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
              className={`${styles.achievementBadge} ${tierClassName(achievement.color)} ${
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
