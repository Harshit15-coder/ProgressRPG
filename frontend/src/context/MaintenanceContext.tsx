// context/MaintenanceContext.tsx
import { createContext, useContext, useState } from 'react';
import type { Dispatch, ReactElement, ReactNode, SetStateAction } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MaintenanceDetails {
  name?: string;
  description?: string;
  startTime?: string | null;
  endTime?: string | null;
}

export interface MaintenanceState {
  active: boolean;
  details: MaintenanceDetails | null;
  previousLocation?: string | null;
  justEnded?: boolean;
}

export interface MaintenanceContextValue {
  maintenance: MaintenanceState;
  setMaintenance: Dispatch<SetStateAction<MaintenanceState>>;
}

interface ProviderProps {
  children: ReactNode;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const MaintenanceContext = createContext<MaintenanceContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function MaintenanceProvider({ children }: ProviderProps): ReactElement {
  const [maintenance, setMaintenance] = useState<MaintenanceState>({
    active: false,
    details: null,
    previousLocation: null,
    justEnded: false,
  });

  return (
    <MaintenanceContext.Provider value={{ maintenance, setMaintenance }}>
      {children}
    </MaintenanceContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useMaintenanceContext(): MaintenanceContextValue {
  const context = useContext(MaintenanceContext);
  if (!context) {
    throw new Error('useMaintenanceContext must be used within a MaintenanceProvider');
  }
  return context;
}
