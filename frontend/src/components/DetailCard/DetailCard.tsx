import type React from "react";
import DetailSurface from "../DetailSurface/DetailSurface";
import Button from "../Button/Button";
import styles from "./DetailCard.module.scss";

function TargetIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </svg>
  );
}

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
  // "center" (default) matches Modal's floating-card layout; "right" docks
  // the card to the viewport's right edge instead (e.g. Map, where a
  // centered card would sit on top of the very content it describes).
  // Both still fall back to the same full-width bottom sheet on mobile.
  placement?: "center" | "right";
  // Omit to render the header with no fly-to affordance (e.g. entities
  // with no map position to fly to yet).
  onFlyTo?: () => void;
}

export default function DetailCard({
  open,
  title,
  onClose,
  children,
  placement = "center",
  onFlyTo,
}: DetailCardProps) {
  return (
    <DetailSurface
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={title}
      modal={placement !== "right"}
    >
      <div className={`${styles.card} ${placement === "right" ? styles.right : ""}`}>
        <div className={styles.header}>
          {/* Plain text, not a heading element - DetailSurface already
              renders an sr-only <h2> with the same text as the dialog's
              accessible name/heading; a second real heading here would
              duplicate it for screen reader users navigating by heading. */}
          <div className={styles.title}>{title}</div>
          {onFlyTo && (
            <Button
              variant="secondary"
              ariaLabel="Fly to"
              className={styles.headerButton}
              icon={<TargetIcon />}
              onClick={onFlyTo}
            />
          )}
          <Button
            variant="secondary"
            ariaLabel="Close"
            className={styles.headerButton}
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
