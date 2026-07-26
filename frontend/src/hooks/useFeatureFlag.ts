import featureFlags from "../featureFlags";
import { useGame } from "../hooks/useGame";
import { useAppConfig } from "./useAppConfig";
import type { AccessGroup, FeatureFlagKey } from "../types";

const hasOwn = (obj: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(obj, key);

function resolveGroups(value: unknown): AccessGroup[] {
  if (Array.isArray(value)) return value as AccessGroup[];
  if (value === true) return ['all'];
  if (typeof value === 'string' && value !== 'no') return [value as AccessGroup];
  return [];
}

// Remote (server-driven) flags take precedence over the local `featureFlags`
// fallback when both define the same key.
export function getFeatureGroups(flag: FeatureFlagKey, remoteFeatureFlags: Record<string, unknown>): AccessGroup[] {
  return hasOwn(remoteFeatureFlags, flag)
    ? resolveGroups(remoteFeatureFlags[flag])
    : resolveGroups(featureFlags[flag]);
}

export function useFeatureFlag(flag: FeatureFlagKey): boolean {
  const { player } = useGame() ?? {};
  const { data: appConfig } = useAppConfig();
  const remoteFeatureFlags = appConfig?.feature_flags ?? {};

  const groups = getFeatureGroups(flag, remoteFeatureFlags);

  if (groups.includes("all")) return true;
  if (groups.includes("premium") && Boolean(player?.is_premium)) return true;
  if (groups.includes("testers") && Boolean(player?.is_tester)) return true;
  return false;
}
