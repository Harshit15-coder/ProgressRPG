import type React from "react";
import DetailSurface from "../DetailSurface/DetailSurface";
import Button from "../Button/Button";
import styles from "./DetailCard.module.scss";

// Reusable, entity-agnostic detail-card shell (see Map's "click a tooltip to
// open a richer detail card" flow) - provides the header/title/close/content
// layout every entity type shares; CharacterDetail/BuildingDetail (and later
// PopulationCentreDetail) supply the actual information as `children`.
// Deliberately has no Radix/Tamagui import of its own - DetailSurface is the
// only piece of this feature that talks to a UI library primitive, so
// swapping it out later doesn't touch this file or its callers.
interface DetailCardProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export default function DetailCard({ open, title, onClose, children }: DetailCardProps) {
  return (
    <DetailSurface
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={title}
    >
      <div className={styles.card}>
        <div className={styles.header}>
          {/* Plain text, not a heading element - DetailSurface already
              renders an sr-only <h2> with the same text as the dialog's
              accessible name/heading; a second real heading here would
              duplicate it for screen reader users navigating by heading. */}
          <div className={styles.title}>{title}</div>
          <Button
            ariaLabel="Close"
            className={styles.closeButton}
            onClick={onClose}
          >
            &times;
          </Button>
        </div>
        <div className={styles.content}>{children}</div>
      </div>
    </DetailSurface>
  );
}
