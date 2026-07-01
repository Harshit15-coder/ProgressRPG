// hooks/useToasts.ts
import { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Toast } from '../context/ToastContext';

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string): void => {
    const id = uuidv4();
    setToasts((prev) => [...prev, { id, message: String(message) }]);
  }, []);

  const dismissToast = useCallback((id: string): void => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return { toasts, showToast, dismissToast };
}
