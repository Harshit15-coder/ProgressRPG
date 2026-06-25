import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
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
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  const handleHeaderControlPointerDown = (e: React.MouseEvent | React.PointerEvent) => {
    // Keep focused text inputs from swallowing the first tap/click on modal controls.
    e.preventDefault();
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose?.();
    }
  };

  useEffect(() => {
    // Store previous focus
    previousFocusRef.current = document.activeElement;

    // Focus modal
    modalRef.current?.focus();

    // Prevent body scroll
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose?.();
      }

      // Tab key focus trap
      if (e.key === "Tab") {
        const focusableElements = modalRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );

        if (!focusableElements || focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    // Listen for keydown when modal is mounted
    document.addEventListener("keydown", handleKeyDown);

    // Cleanup listener on unmount
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = '';
      (previousFocusRef.current as HTMLElement | null)?.focus();
    };
  }, [onClose]);

  const titleId = `${id}-title`;

  return createPortal(
    <div className={styles.modalBackdrop} onClick={handleBackdropClick} role="presentation">
      <div
        ref={modalRef}
        className={[styles.modal, size ? styles[size] : '', className || ''].join(' ').trim()}
        style={style}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          {onBack ? (
            <Button
              onClick={onBack}
              onMouseDown={handleHeaderControlPointerDown}
              onPointerDown={handleHeaderControlPointerDown}
              ariaLabel={backLabel}
              className={styles.backButton}
            >
              ← {backLabel}
            </Button>
          ) : null}
          <h2 id={titleId}>{title}</h2>
          <Button
            onClick={onClose}
            onMouseDown={handleHeaderControlPointerDown}
            onPointerDown={handleHeaderControlPointerDown}
            ariaLabel="Close modal"
            className={styles.closeButton}
          >
            &times;
          </Button>
        </div>
        <div className={styles.modalContent}>
          {children}
        </div>
        {footer && (
          <div className={styles.modalFooter}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
