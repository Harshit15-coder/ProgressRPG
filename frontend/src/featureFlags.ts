// src/featureFlags.ts
import type { FeatureFlagKey, FeatureFlagValue } from "./types";

const featureFlags: Record<FeatureFlagKey, FeatureFlagValue> = {
  // Access levels:
  // - 'no': disabled for everyone
  // - 'all': enabled for all users
  // - 'premium': enabled for premium users only
  activityList: 'all',
  tasksPage: 'all',
  categoriesPage: 'all',
  skillsPage: 'all',
  projectsPage: 'all',
};

export default featureFlags;
