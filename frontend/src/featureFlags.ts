// src/featureFlags.ts
import type { FeatureFlagKey, FeatureFlagValue } from "./types";

const featureFlags: Record<FeatureFlagKey, FeatureFlagValue> = {
  // Each flag is an array of groups that have access.
  // Groups: 'all' | 'premium' | 'testers'
  // Empty array = disabled for everyone.
  activityList: ['all'],
  tasksFeature: ['all'],
  categoriesPage: ['all'],
  skillsPage: ['all'],
  projectsPage: ['all'],
  toastsFeature: [],
  unified_homepage: [],
};

export default featureFlags;
