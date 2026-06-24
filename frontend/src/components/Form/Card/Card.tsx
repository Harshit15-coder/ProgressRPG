import React, { useState } from "react";
import Button from "../../Button/Button";
import styles from "./Card.module.scss";

interface ExpandableCardProps {
  title: string;
  summary?: React.ReactNode;
  children?: React.ReactNode;
}

function ExpandableCard({ title, summary, children }: ExpandableCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader} onClick={() => setIsExpanded(!isExpanded)}>
        <h3>{title}</h3>
        <Button
          className={styles.toggleBtn}
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation(); // prevent double toggle
            setIsExpanded(!isExpanded);
          }}
        >
          {isExpanded ? "−" : "+"}
        </Button>
      </div>

      <div className="card-summary">
        {summary}
      </div>

      {isExpanded && (
        <div className={styles.cardDetails}>
          {children}
        </div>
      )}
    </div>
  );
}

export default ExpandableCard;
