// hooks/useWebSocket.ts
import { useContext } from 'react';
import { WebSocketContext, type WebSocketContextValue } from '../context/webSocketContext';

export function useWebSocket(): WebSocketContextValue {
  const ctx = useContext(WebSocketContext);
  if (!ctx) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return ctx;
}
