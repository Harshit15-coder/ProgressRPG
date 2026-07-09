// src/featureFlags.ts
import type { FeatureFlagKey, FeatureFlagValue } from "./types";

const featureFlags: Record<FeatureFlagKey, FeatureFlagValue> = {
  // Each flag is an array of groups that have access.
  // Groups: 'all' | 'premium' | 'testers'
  // Empty array = disabled for everyone.
  activityList: ['all'],
  tasksFeature: ['testers'],
  categoriesPage: [],
  skillsPage: [],
  projectsPage: [],
  toastsFeature: [],
  announcements: ['testers'],
  onlinePlayerCount: ['testers'],
  your_library: [],
  unified_homepage: [],
};

export default featureFlags;
