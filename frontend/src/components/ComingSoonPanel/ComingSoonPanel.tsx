import React from "react";

import styles from "./ComingSoonPanel.module.scss";

interface ComingSoonPanelProps {
  itemLabelPlural: string;
}

export default function ComingSoonPanel({ itemLabelPlural }: ComingSoonPanelProps): React.ReactElement {
  const capitalized = itemLabelPlural.charAt(0).toUpperCase() + itemLabelPlural.slice(1);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2>{capitalized}</h2>
      </div>

      <div className={styles.emptyState}>
        <p>{capitalized} are coming soon! Stay tuned.</p>
      </div>
    </div>
  );
}
