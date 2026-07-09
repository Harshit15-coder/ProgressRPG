import React from "react";
import ActivityTimeline from "../../components/ActivityTimeline/ActivityTimeline";
import CurrentActivity from "../../components/CurrentActivity/CurrentActivity";
import UnifiedTimerHome from "../../components/UnifiedTimerHome/UnifiedTimerHome";
import Infobar from "../../layout/Infobar/Infobar";
import { useFeatureFlag } from "../../hooks/useFeatureFlag";
import styles from "./ActivityTimelinePage.module.scss";

export default function ActivityTimelinePage(): React.ReactElement {
  const isUnifiedHomepage = useFeatureFlag("unified_homepage");

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <h1 className="sr-only">Timer</h1>
        <Infobar />
        {isUnifiedHomepage ? (
          <UnifiedTimerHome />
        ) : (
          <>
            <CurrentActivity />
            <ActivityTimeline />
          </>
        )}
      </div>
    </div>
  );
}
