// hooks/useToasts.ts
import { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Toast } from '../context/ToastContext';

export function useToasts(duration = 3300) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string): void => {
    const id = uuidv4();
    setToasts((prev) => [...prev, { id, message: String(message) }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, duration);
  }, [duration]);

  return { toasts, showToast };
}
