/** Builds the toast message shown after an activity completes, or null to suppress it. */
export function buildActivityRewardToastMessage(
  xpGained: number | null | undefined,
  levelUps: number[] | null | undefined
): string | null {
  const xp = xpGained ?? 0;
  if (xp <= 0) return null;

  const highestLevel = Array.isArray(levelUps) && levelUps.length > 0 ? Math.max(...levelUps) : null;

  const xpMessage = `You got ${xp} XP!`;
  return highestLevel !== null ? `${xpMessage} Now level ${highestLevel}.` : xpMessage;
}
