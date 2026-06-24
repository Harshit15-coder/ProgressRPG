// context/WebSocketContext.tsx
import { useRef, useCallback } from 'react';
import type { ReactNode, ReactElement } from 'react';
import { useGame } from './GameContext';
import { useToast } from './ToastContext';
import { useAuth } from './AuthContext';
import { useWebSocketConnection } from '../hooks/useWebSocketConnection';
import { handleGlobalWebSocketEvent } from '../websockets/handleGlobalWebSocketEvent';
import { useMaintenanceStatus } from '../hooks/useMaintenanceStatus';
import { WebSocketContext } from './webSocketContext';
import type { IncomingWebSocketMessage, OutgoingWebSocketMessage } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProviderProps {
  children: ReactNode;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const WebSocketProvider = ({ children }: ProviderProps): ReactElement => {
  const { player } = useGame();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const { refetch: maintenanceRefetch } = useMaintenanceStatus();
  // Set stores message handler callbacks registered by child components
  const eventHandlersRef = useRef<Set<(data: IncomingWebSocketMessage) => void>>(new Set());
  const wsEnabled = Boolean(!authLoading && isAuthenticated && player?.id);

  const onMessage = useCallback((data: IncomingWebSocketMessage) => {
    //console.log("[WS Provider] showToast:", showToast);
    // handleGlobalWebSocketEvent is a .js file whose TS inference marks setMaintenance
    // as required; the refetch path handles the case without it (uses optional chaining).
    // Cast opts to any to avoid a spurious error until that file is migrated.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handleGlobalWebSocketEvent(data, { showToast, maintenanceRefetch } as any);
    eventHandlersRef.current.forEach((handler) => handler(data));
  }, [showToast, maintenanceRefetch]);

  const onError = useCallback(() => {
    console.error('WebSocket connection error');
  }, []);

  const onClose = useCallback(() => {
    console.warn('WebSocket disconnected');
  }, []);

  const onOpen = useCallback(() => {
    //console.log('WebSocket connected!');
  }, []);

  const { send, isConnected, disconnect } = useWebSocketConnection(
    player?.id,
    onMessage,
    onError,
    onClose,
    onOpen,
    wsEnabled
  );

  const addEventHandler = useCallback((handler: (data: IncomingWebSocketMessage) => void): (() => void) => {
    eventHandlersRef.current.add(handler);
    return () => eventHandlersRef.current.delete(handler);
  }, []);

  const typedSend = (data: OutgoingWebSocketMessage): void => send(data);

  return (
    <WebSocketContext.Provider value={{ send: typedSend, isConnected, addEventHandler, disconnect }}>
      {children}
    </WebSocketContext.Provider>
  );
};
