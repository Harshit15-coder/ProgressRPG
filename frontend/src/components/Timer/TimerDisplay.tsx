// components/TimerDisplay/TimerDisplay.tsx
import React from 'react';
import styles from './TimerDisplay.module.scss';
import type { TimerStatus } from '../../types';

interface TimerDisplayProps {
  label?: string;
  time?: string;
  status?: TimerStatus;
}

export default function TimerDisplay({ label = 'Timer', time = '00:00', status }: TimerDisplayProps) {
  return (
    <div className={styles.timerFrame}>
      <div className={styles.timerStatus}>
        {label}: {status}
      </div>
      <div className={styles.timerText}>
        {time}
      </div>
    </div>
  );
}
