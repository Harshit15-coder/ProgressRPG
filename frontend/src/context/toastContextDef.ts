import { createContext } from 'react';

export interface Toast {
  id: string;
  message: string;
}

export interface ToastContextValue {
  toasts: Toast[];
  showToast: (message: string) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);
