import React from 'react';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import styles from './AlertDialog.module.scss';
import Button from '../Button/Button';

interface AlertDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'default' | 'destructive';
}

/**
 * Use AlertDialog for confirm/destructive prompts that interrupt the user and
 * require a decision before continuing. For informational overlays, use Modal.
 */
export default function AlertDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'default',
}: AlertDialogProps) {
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className={styles.overlay} />
        <AlertDialogPrimitive.Content className={styles.content}>
          <AlertDialogPrimitive.Title className={styles.title}>
            {title}
          </AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description className={styles.description}>
            {description}
          </AlertDialogPrimitive.Description>
          <div className={styles.actions}>
            <AlertDialogPrimitive.Cancel asChild>
              <Button variant="secondary">
                {cancelLabel}
              </Button>
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action asChild>
              <Button
                variant={variant === 'destructive' ? 'danger' : 'primary'}
                onClick={onConfirm}
              >
                {confirmLabel}
              </Button>
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
