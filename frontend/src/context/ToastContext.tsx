// context/ToastContext.tsx

import { createContext, useContext } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { useToasts } from '../hooks/useToasts';
// ToastManager is temporarily deactivated
// import ToastManager from '../components/Toast/ToastManager';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Toast {
  id: string;
  message: string;
}

export interface ToastContextValue {
  toasts: Toast[];
  showToast: (message: string) => void;
}

interface ProviderProps {
  children: ReactNode;
  duration?: number;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ToastContext = createContext<ToastContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ToastProvider({ children, duration }: ProviderProps): ReactElement {
  const { toasts, showToast } = useToasts(duration);

  return (
    <ToastContext.Provider value={{ toasts, showToast }}>
      {children}
      {/* <ToastManager messages={toasts} /> */}
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
