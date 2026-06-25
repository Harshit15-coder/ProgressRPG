import React from 'react';
import styles from './ButtonFrame.module.scss';

interface ButtonFrameProps {
  children: React.ReactNode;
}

export default function ButtonFrame({ children }: ButtonFrameProps) {
  return <div className={styles.buttonFrame}>{children}</div>;
}
