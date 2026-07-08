// context/WebSocketContext.tsx
import { useRef, useCallback, useEffect } from 'react';
import type { ReactNode, ReactElement } from 'react';
import { useGame } from '../hooks/useGame';
import { useOnlineCount } from './OnlineCountContext';
import { useToast } from '../hooks/useToast';
import { useAuth } from './AuthContext';
import { useWebSocketConnection } from '../hooks/useWebSocketConnection';
import { handleGlobalWebSocketEvent } from '../websockets/handleGlobalWebSocketEvent';
import { useMaintenanceStatus } from '../hooks/useMaintenanceStatus';
import { useMaintenanceContext } from './MaintenanceContext';
import { WebSocketContext } from './webSocketContext';
import type { IncomingWebSocketMessage, OutgoingWebSocketMessage } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProviderProps {
  children: ReactNode;
}

// How often to ping the server while connected, so the backend's
// `last_seen` heartbeat stays fresh and this connection isn't swept up as
// abandoned by users.tasks.reconcile_stale_online_players.
const HEARTBEAT_INTERVAL_MS = 60_000;

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const WebSocketProvider = ({ children }: ProviderProps): ReactElement => {
  const { player } = useGame();
  const { setOnlinePlayerCount } = useOnlineCount();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const { refetch: maintenanceRefetch } = useMaintenanceStatus();
  const { setMaintenance } = useMaintenanceContext();
  // Set stores message handler callbacks registered by child components
  const eventHandlersRef = useRef<Set<(data: IncomingWebSocketMessage) => void>>(new Set());
  const wsEnabled = Boolean(!authLoading && isAuthenticated && player?.id);

  const onMessage = useCallback((data: IncomingWebSocketMessage) => {
    if (data.type === 'online_count') {
      setOnlinePlayerCount(data.count);
    }
    //console.log("[WS Provider] showToast:", showToast);
    handleGlobalWebSocketEvent(data, { showToast, maintenanceRefetch, setMaintenance });
    eventHandlersRef.current.forEach((handler) => handler(data));
  }, [showToast, maintenanceRefetch, setMaintenance, setOnlinePlayerCount]);

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

  useEffect(() => {
    if (!isConnected) {
      return;
    }
    const intervalId = setInterval(() => {
      typedSend({ type: 'ping' });
    }, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  return (
    <WebSocketContext.Provider value={{ send: typedSend, isConnected, addEventHandler, disconnect }}>
      {children}
    </WebSocketContext.Provider>
  );
};
