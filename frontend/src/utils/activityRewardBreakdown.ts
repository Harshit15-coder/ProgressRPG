import { formatDuration, formatRewardDuration } from "./formatUtils";

export interface MultiplierLine {
  label: string;
  value: string;
}

export interface ActivityRewardBreakdownInput {
  activityName?: string | null;
  xpGained?: number | null;
  baseXp?: number | null;
  xpMultiplier?: number | null;
  taskXpMultiplier?: number | null;
  levelUps?: number[] | null;
  elapsedSeconds?: number | null;
}

export interface ActivityRewardBreakdown {
  /** Whether xpGained parsed to a real number and should be rendered. */
  hasXp: boolean;
  /** Parsed XP total; only meaningful when hasXp is true. */
  xpGained: number;
  /** Whether elapsedSeconds parsed to a real, non-negative number. */
  hasElapsedSeconds: boolean;
  /** "1:30" style duration for the breakdown's Time row. */
  condensedElapsed: string | null;
  /** Top summary line — one of four phrasings depending on whether an activity name and/or elapsed time are present. */
  rewardSummaryLine: string;
  /** "Premium bonus" / "Task bonus" rows, present only when their multiplier applies. */
  multiplierLines: MultiplierLine[];
  /** True once the inferred premium multiplier looks like a paid account's (>= 2x). */
  isLikelyPremiumUser: boolean;
  /** levelUps coerced to positive integers, dropping anything malformed. */
  normalizedLevelUps: number[];
  /** Whether activityName is a non-blank string. */
  hasActivityName: boolean;
}

function formatMultiplier(multiplier: number): string {
  return Number.isInteger(multiplier) ? String(multiplier) : multiplier.toFixed(2).replace(/\.?0+$/, "");
}

/**
 * Computes the post-activity reward breakdown — premium/task multiplier
 * rows, total XP, and the summary line — for any screen that needs to
 * render it (the SupportFlow modal today; potentially others later). Pure
 * and side-effect free so the multiplier maths — easy to get subtly wrong
 * once premium and task bonuses stack — is unit-testable without rendering
 * a component.
 *
 * Deliberately NOT merged with `buildActivityRewardToastMessage`
 * (activityRewardToast.ts): the toast collapses everything to a single
 * "You got N XP! Now level M." line off just xpGained/levelUps, while this
 * renders every level-up as its own row and needs the premium/task
 * multiplier maths the toast never touches. The two consumers want
 * differently-shaped output from mostly-disjoint inputs, so sharing would
 * mean threading unrelated data through both call sites for little benefit.
 */
export function buildActivityRewardBreakdown({
  activityName,
  xpGained,
  baseXp,
  xpMultiplier,
  taskXpMultiplier,
  levelUps,
  elapsedSeconds,
}: ActivityRewardBreakdownInput): ActivityRewardBreakdown {
  const hasActivityName = typeof activityName === "string" && Boolean(activityName.trim());
  const trimmedActivityName = hasActivityName ? activityName!.trim() : null;

  const parsedXp = Number(xpGained);
  const hasXp = Number.isFinite(parsedXp);

  const parsedBaseXp = Number(baseXp);
  const parsedMultiplier = Number(xpMultiplier);
  const hasRewardBreakdown =
    Number.isFinite(parsedBaseXp) &&
    parsedBaseXp >= 0 &&
    Number.isFinite(parsedMultiplier) &&
    parsedMultiplier > 0 &&
    hasXp;

  const parsedElapsedSeconds = Number(elapsedSeconds);
  const hasElapsedSeconds = Number.isFinite(parsedElapsedSeconds) && parsedElapsedSeconds >= 0;
  const formattedElapsed = hasElapsedSeconds ? formatRewardDuration(parsedElapsedSeconds) : null;
  const condensedElapsed = hasElapsedSeconds ? formatDuration(parsedElapsedSeconds) : null;

  const parsedTaskXpMultiplier = Number(taskXpMultiplier);
  const hasTaskBonus = Number.isFinite(parsedTaskXpMultiplier) && parsedTaskXpMultiplier > 1;

  // Infer the premium component: combined / task (or combined if no task bonus).
  const premiumMultiplier =
    hasRewardBreakdown && hasTaskBonus && parsedTaskXpMultiplier > 0
      ? parsedMultiplier / parsedTaskXpMultiplier
      : parsedMultiplier;

  const multiplierLines: MultiplierLine[] = [];
  if (hasRewardBreakdown) {
    if (premiumMultiplier > 1) {
      multiplierLines.push({ label: "Premium bonus", value: `x${formatMultiplier(premiumMultiplier)}` });
    }
    if (hasTaskBonus) {
      multiplierLines.push({ label: "Task bonus", value: `x${formatMultiplier(parsedTaskXpMultiplier)}` });
    }
  }

  let rewardSummaryLine = "Nice work ⚔️ You completed an activity.";
  if (formattedElapsed && hasActivityName) {
    rewardSummaryLine = `Nice work ⚔️ You spent ${formattedElapsed} on "${trimmedActivityName}".`;
  } else if (hasActivityName) {
    rewardSummaryLine = `Nice work ⚔️ You completed "${trimmedActivityName}".`;
  } else if (formattedElapsed) {
    rewardSummaryLine = `Nice work ⚔️ You spent ${formattedElapsed} focused.`;
  }

  const normalizedLevelUps = Array.isArray(levelUps)
    ? levelUps.map((level) => Number(level)).filter((level) => Number.isInteger(level) && level > 0)
    : [];

  return {
    hasXp,
    xpGained: parsedXp,
    hasElapsedSeconds,
    condensedElapsed,
    rewardSummaryLine,
    multiplierLines,
    isLikelyPremiumUser: premiumMultiplier >= 2,
    normalizedLevelUps,
    hasActivityName,
  };
}
