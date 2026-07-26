import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useOnlineCount } from '../../context/OnlineCountContext';
import styles from './OnlineCountBadge.module.scss';

export default function OnlineCountBadge() {
  const { isAuthenticated } = useAuth();
  const { onlinePlayerCount } = useOnlineCount();

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className={styles.badge} aria-live="polite" role="status">
      <span aria-hidden="true">🟢 </span>
      {Math.max(1, onlinePlayerCount)} players online
    </div>
  );
}
