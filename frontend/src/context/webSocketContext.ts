import { createContext } from 'react';
import type { OutgoingWebSocketMessage, IncomingWebSocketMessage } from '../types';

export interface WebSocketContextValue {
  send: (data: OutgoingWebSocketMessage) => void;
  isConnected: boolean;
  addEventHandler: (handler: (data: IncomingWebSocketMessage) => void) => () => void;
  disconnect: (code?: number, reason?: string) => void;
}

export const WebSocketContext = createContext<WebSocketContextValue | null>(null);
