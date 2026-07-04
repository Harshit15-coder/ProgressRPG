// context/OnlineCountContext.tsx
import { createContext, useContext, useState } from 'react';
import type { Dispatch, ReactElement, ReactNode, SetStateAction } from 'react';
import { useGame } from '../hooks/useGame';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OnlineCountContextValue {
  onlinePlayerCount: number;
  setOnlinePlayerCount: Dispatch<SetStateAction<number>>;
}

interface ProviderProps {
  children: ReactNode;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const OnlineCountContext = createContext<OnlineCountContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

// Kept separate from GameContext so that websocket-driven updates to this
// count don't re-render every consumer of useGame() on every connect/
// disconnect anywhere in the system.
export function OnlineCountProvider({ children }: ProviderProps): ReactElement {
  const { initialOnlineCount } = useGame();
  const [onlinePlayerCount, setOnlinePlayerCount] = useState<number>(initialOnlineCount);

  return (
    <OnlineCountContext.Provider value={{ onlinePlayerCount, setOnlinePlayerCount }}>
      {children}
    </OnlineCountContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useOnlineCount(): OnlineCountContextValue {
  const context = useContext(OnlineCountContext);
  if (!context) {
    throw new Error('useOnlineCount must be used within an OnlineCountProvider');
  }
  return context;
}
