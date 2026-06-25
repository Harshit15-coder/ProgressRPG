import React from 'react';
import styles from './PlayerPage.module.scss';
import Infobar from '../../layout/Infobar/Infobar';
import ProfileContent from '../../layout/Player/PlayerContent';

export default function PlayerPage(): React.ReactElement {
  return (
    <div className={styles.page}>
      <Infobar />
      <div className={styles.content}>
        <ProfileContent />
      </div>
    </div>
  );
}
