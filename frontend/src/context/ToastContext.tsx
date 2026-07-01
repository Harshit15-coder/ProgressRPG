// context/ToastContext.tsx

import { createContext } from 'react';
import type { ReactElement, ReactNode } from 'react';
import * as RadixToast from '@radix-ui/react-toast';
import { useToasts } from '../hooks/useToasts';
import { useFeatureFlag } from '../hooks/useFeatureFlag';
import ToastManager from '../components/Toast/ToastManager';

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

export const ToastContext = createContext<ToastContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ToastProvider({ children, duration = 3300 }: ProviderProps): ReactElement {
  const { toasts, showToast, dismissToast } = useToasts();
  const toastsEnabled = useFeatureFlag('toastsFeature');

  return (
    <RadixToast.Provider duration={duration}>
      <ToastContext.Provider value={{ toasts, showToast }}>
        {children}
        {toastsEnabled && <ToastManager messages={toasts} onDismiss={dismissToast} />}
      </ToastContext.Provider>
    </RadixToast.Provider>
  );
}
