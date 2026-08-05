import { describe, expect, it } from "vitest";
import { buildActivityRewardBreakdown } from "./activityRewardBreakdown";

describe("buildActivityRewardBreakdown", () => {
  it("renders a zero-XP completion without crashing and with an empty multiplier list", () => {
    const breakdown = buildActivityRewardBreakdown({
      activityName: "Write tests",
      xpGained: 0,
      baseXp: 0,
      xpMultiplier: 1,
      elapsedSeconds: 60,
    });

    expect(breakdown.hasXp).toBe(true);
    expect(breakdown.xpGained).toBe(0);
    expect(breakdown.multiplierLines).toEqual([]);
    expect(breakdown.isLikelyPremiumUser).toBe(false);
  });

  it("has no multiplier lines when neither premium nor task bonus applies", () => {
    const breakdown = buildActivityRewardBreakdown({
      xpGained: 27,
      baseXp: 27,
      xpMultiplier: 1,
    });

    expect(breakdown.multiplierLines).toEqual([]);
    expect(breakdown.isLikelyPremiumUser).toBe(false);
  });

  it("shows only the premium bonus when there is no task multiplier", () => {
    const breakdown = buildActivityRewardBreakdown({
      xpGained: 54,
      baseXp: 27,
      xpMultiplier: 2,
    });

    expect(breakdown.multiplierLines).toEqual([{ label: "Premium bonus", value: "x2" }]);
    expect(breakdown.isLikelyPremiumUser).toBe(true);
  });

  it("shows only the task bonus when the combined multiplier is entirely the task bonus", () => {
    const breakdown = buildActivityRewardBreakdown({
      xpGained: 40,
      baseXp: 27,
      xpMultiplier: 1.5,
      taskXpMultiplier: 1.5,
    });

    expect(breakdown.multiplierLines).toEqual([{ label: "Task bonus", value: "x1.5" }]);
    expect(breakdown.isLikelyPremiumUser).toBe(false);
  });

  it("shows both bonuses and infers the premium component from the combined multiplier", () => {
    const breakdown = buildActivityRewardBreakdown({
      xpGained: 81,
      baseXp: 27,
      xpMultiplier: 3,
      taskXpMultiplier: 1.5,
    });

    expect(breakdown.multiplierLines).toEqual([
      { label: "Premium bonus", value: "x2" },
      { label: "Task bonus", value: "x1.5" },
    ]);
    expect(breakdown.isLikelyPremiumUser).toBe(true);
  });

  it("uses the 'spent <time> on \"<name>\"' phrasing when both are present", () => {
    const breakdown = buildActivityRewardBreakdown({
      activityName: "Write tests",
      xpGained: 27,
      baseXp: 27,
      xpMultiplier: 1,
      elapsedSeconds: 90,
    });

    expect(breakdown.rewardSummaryLine).toBe('Nice work ⚔️ You spent 1 minute 30 seconds on "Write tests".');
  });

  it("uses the 'completed \"<name>\"' phrasing when there is a name but no elapsed time", () => {
    const breakdown = buildActivityRewardBreakdown({
      activityName: "Write tests",
      xpGained: 27,
    });

    expect(breakdown.rewardSummaryLine).toBe('Nice work ⚔️ You completed "Write tests".');
  });

  it("uses the 'spent <time> focused' phrasing when there is elapsed time but no name", () => {
    const breakdown = buildActivityRewardBreakdown({
      xpGained: 27,
      elapsedSeconds: 90,
    });

    expect(breakdown.rewardSummaryLine).toBe("Nice work ⚔️ You spent 1 minute 30 seconds focused.");
  });

  it("uses the generic 'completed an activity' phrasing when neither is present", () => {
    const breakdown = buildActivityRewardBreakdown({
      xpGained: 27,
    });

    expect(breakdown.rewardSummaryLine).toBe("Nice work ⚔️ You completed an activity.");
  });

  it("normalizes level-ups to positive integers, dropping malformed entries", () => {
    // 0 and negative values are dropped; 4.5 isn't an integer; "5" coerces fine via Number().
    const malformedLevelUps = [3, 0, -1, 4.5, "5"] as unknown as number[];
    const breakdown = buildActivityRewardBreakdown({ xpGained: 27, levelUps: malformedLevelUps });

    expect(breakdown.normalizedLevelUps).toEqual([3, 5]);
  });

  it("reports no XP when xpGained is missing", () => {
    const breakdown = buildActivityRewardBreakdown({ activityName: "Write tests" });

    expect(breakdown.hasXp).toBe(false);
  });
});
