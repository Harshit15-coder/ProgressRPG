import type React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import styles from "./DetailSurface.module.scss";

// The one file in the map entity detail card (DetailSurface -> DetailCard
// -> CharacterDetail/BuildingDetail, see MapTooltips.tsx/Map.tsx) allowed
// to import a UI library primitive directly - everything above it works
// against this component's plain open/onOpenChange/title/children props,
// so swapping the overlay/sheet/dialog primitive underneath (e.g. once the
// project's in-progress Radix -> Tamagui migration reaches this component)
// only touches this file.
interface DetailSurfaceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Accessible name for the surface - not rendered visually here (DetailCard
   * renders its own visible title inside `children`); Radix requires every
   * Dialog to have one for screen reader users. */
  title: string;
  children: React.ReactNode;
}

export default function DetailSurface({
  open,
  onOpenChange,
  title,
  children,
}: DetailSurfaceProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={styles.overlay} />
        <DialogPrimitive.Content className={styles.content}>
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
