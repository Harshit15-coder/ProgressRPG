// src/components/FeatureToggle.tsx
import React from 'react';
import Button from './Button/Button';
import featureFlags from '../featureFlags';
import { useFeatureFlag } from '../hooks/useFeatureFlag';
import { useAppConfig } from '../hooks/useAppConfig';
import styles from './FeatureToggle.module.scss';
import type { AccessGroup, FeatureFlagKey } from '../types';

const hasOwn = (obj: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(obj, key);

function resolveGroups(value: unknown): AccessGroup[] {
  if (Array.isArray(value)) return value as AccessGroup[];
  if (value === true) return ['all'];
  if (typeof value === 'string' && value !== 'no') return [value as AccessGroup];
  return [];
}

interface FeatureToggleProps {
  flag: FeatureFlagKey;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export default function FeatureToggle({ flag, children, fallback }: FeatureToggleProps) {
  const { data: appConfig } = useAppConfig();
  const remoteFeatureFlags = appConfig?.feature_flags ?? {};
  const groups: AccessGroup[] = hasOwn(remoteFeatureFlags, flag)
    ? resolveGroups(remoteFeatureFlags[flag])
    : resolveGroups(featureFlags[flag]);

  const isEnabled = useFeatureFlag(flag);

  const isPremiumGated = !groups.includes('all') && groups.includes('premium');
  const defaultFallback = isPremiumGated ? (
    <div className={styles.fallbackPage}>
      <div className={styles.fallbackCard}>
        <p className={styles.fallbackTitle}>Premium feature</p>
        <p>This feature is available to Premium users.</p>
        <Button as="a" href="/upgrade">Upgrade to premium</Button>
      </div>
    </div>
  ) : (
    <div className={styles.fallbackPage}>
      <div className={styles.fallbackCard}>
        <p className={styles.fallbackTitle}>Coming soon</p>
        <p>This feature is coming soon! Stay tuned.</p>
      </div>
    </div>
  );

  const resolvedFallback = fallback !== undefined ? fallback : defaultFallback;

  return isEnabled ? <>{children}</> : <>{resolvedFallback}</>;
}
