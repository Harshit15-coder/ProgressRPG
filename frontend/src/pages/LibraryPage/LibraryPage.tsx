import React from "react";
import * as Tabs from "@radix-ui/react-tabs";

import TasksPage from "../TasksPage/TasksPage";
import ActivitiesPage from "../ActivitiesPage";
import ComingSoonPanel from "../../components/ComingSoonPanel/ComingSoonPanel";
import styles from "./LibraryPage.module.scss";

export default function LibraryPage(): React.ReactElement {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Your library</h1>
      </div>

      <Tabs.Root className={styles.tabsRoot} defaultValue="tasks">
        <Tabs.List className={styles.tabBar} aria-label="Your library sections">
          <Tabs.Trigger value="tasks" className={styles.tab}>
            Tasks
          </Tabs.Trigger>
          <Tabs.Trigger value="activities" className={styles.tab}>
            Activities
          </Tabs.Trigger>
          <Tabs.Trigger value="skills" className={styles.tab}>
            Skills
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="tasks" className={styles.tabContent}>
          <TasksPage showHeading={false} />
        </Tabs.Content>

        <Tabs.Content value="activities" className={styles.tabContent}>
          <ActivitiesPage showHeading={false} />
        </Tabs.Content>

        <Tabs.Content value="skills" className={styles.tabContent}>
          <ComingSoonPanel itemLabelPlural="skills" />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
