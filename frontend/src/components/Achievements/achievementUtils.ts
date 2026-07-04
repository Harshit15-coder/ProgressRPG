export const formatAchievementValue = (type: string, value: number): string => {
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

export const achievementProgress = (achievement: {
  value: number;
  threshold: number;
  complete: boolean;
}): number => {
  if (achievement.complete) {
    return 100;
  }
  if (achievement.threshold <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((achievement.value / achievement.threshold) * 100));
};

export const tierClassName = (
  styles: Record<string, string>,
  color: string | undefined
): string => {
  const normalized = typeof color === "string"
    ? color.charAt(0).toUpperCase() + color.slice(1)
    : "";
  return styles[`tier${normalized}`] || styles.tierGrey;
};
