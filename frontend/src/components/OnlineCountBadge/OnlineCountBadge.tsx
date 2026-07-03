import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useGame } from '../../context/GameContext';
import styles from './OnlineCountBadge.module.scss';

export default function OnlineCountBadge() {
  const { isAuthenticated } = useAuth();
  const { onlinePlayerCount } = useGame();

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className={styles.badge} aria-live="polite" role="status">
      <span aria-hidden="true">🟢 </span>
      {onlinePlayerCount} players online
    </div>
  );
}
