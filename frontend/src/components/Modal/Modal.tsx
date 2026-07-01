import React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import styles from "./Modal.module.scss";
import Button from "../Button/Button";

interface ModalProps {
  title?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  onClose?: () => void;
  onBack?: (() => void) | null;
  backLabel?: string;
  id?: string;
  size?: string;
  className?: string;
  style?: React.CSSProperties;
}

export default function Modal({
  title,
  children,
  footer,
  onClose,
  onBack,
  backLabel = "Back",
  id = 'modal',
  size,
  className,
  style,
}: ModalProps) {
  return (
    <DialogPrimitive.Root open onOpenChange={(open) => { if (!open) onClose?.(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={styles.modalBackdrop} data-testid="modal-overlay" />
        <DialogPrimitive.Content
          id={id}
          className={[styles.modal, size ? styles[size] : '', className || ''].join(' ').trim()}
          style={style}
        >
          <div className={styles.modalHeader}>
            {onBack ? (
              <Button
                onClick={onBack}
                ariaLabel={backLabel}
                className={styles.backButton}
              >
                ← {backLabel}
              </Button>
            ) : null}
            <DialogPrimitive.Title asChild>
              <h2>{title}</h2>
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button
                ariaLabel="Close modal"
                className={styles.closeButton}
              >
                &times;
              </Button>
            </DialogPrimitive.Close>
          </div>
          <div className={styles.modalContent}>
            {children}
          </div>
          {footer && (
            <div className={styles.modalFooter}>
              {footer}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
