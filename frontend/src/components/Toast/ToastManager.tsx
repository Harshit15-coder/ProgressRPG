import * as Toast from '@radix-ui/react-toast';
import styles from './Toast.module.scss';
import type { Toast as ToastMessage } from '../../context/ToastContext';

interface ToastManagerProps {
  messages: ToastMessage[];
  onDismiss: (id: string) => void;
}

export default function ToastManager({ messages, onDismiss }: ToastManagerProps) {
  return (
    <>
      {messages.map(({ id, message }) => (
        <Toast.Root
          key={id}
          open
          onOpenChange={(open) => { if (!open) onDismiss(id); }}
          className={styles.toast}
          type="background"
        >
          <div className={styles.inner}>
            <div className={styles.icon} aria-hidden="true" />
            <div className={styles.content}>
              <Toast.Description className={styles.message}>{message}</Toast.Description>
            </div>
          </div>
        </Toast.Root>
      ))}
      <Toast.Viewport className={styles.toastViewport} />
    </>
  );
}
