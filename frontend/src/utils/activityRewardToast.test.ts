import { describe, expect, it } from 'vitest';
import { buildActivityRewardToastMessage } from './activityRewardToast';

describe('buildActivityRewardToastMessage', () => {
  it('returns an XP-only message when there are no level-ups', () => {
    expect(buildActivityRewardToastMessage(15, [])).toBe('You got 15 XP!');
  });

  it('appends the highest level reached when there are level-ups', () => {
    expect(buildActivityRewardToastMessage(40, [3, 4, 5])).toBe('You got 40 XP! Now level 5.');
  });

  it('returns null for a zero-XP completion', () => {
    expect(buildActivityRewardToastMessage(0, [])).toBeNull();
  });

  it('returns null when xpGained is null or undefined', () => {
    expect(buildActivityRewardToastMessage(null, [])).toBeNull();
    expect(buildActivityRewardToastMessage(undefined, [])).toBeNull();
  });
});
