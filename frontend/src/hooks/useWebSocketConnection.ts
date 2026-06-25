/* eslint-disable react-hooks/set-state-in-effect */
// hooks/useWebSocketConnection.ts
import { useEffect, useRef, useCallback, useState } from 'react';
import { API_BASE_URL } from '../config';
import { getValidAccessToken } from "../utils/api";
import type { IncomingWebSocketMessage, OutgoingWebSocketMessage } from "../types";

// WebSocket connection constants
const RECONNECT_DELAY_MS = 3000;
const RETRY_DELAY_MS = 5000;
const NORMAL_CLOSURE = 1000;
const GOING_AWAY = 1001;

export function useWebSocketConnection(
  playerId: number | undefined,
  onMessage?: (data: IncomingWebSocketMessage) => void,
  onError?: (err: Event) => void,
  onClose?: (event: CloseEvent) => void,
  onOpen?: () => void,
  shouldConnect = true,
) {
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const intentionalCloseRef = useRef<boolean>(false);
  const connectRef = useRef<(() => Promise<void>) | null>(null);

  const connect = useCallback(async (): Promise<void> => {
    if (!shouldConnect) {
      return;
    }

    if (!playerId) {
      console.warn('[WS] No player ID, skipping connection');
      return;
    }

    try {
      const accessToken = await getValidAccessToken();

      // Build WebSocket URL
      const url = new URL(API_BASE_URL);
      const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = new URL(`${protocol}//${url.host}/ws/profile_${playerId}/`);
      wsUrl.searchParams.set('token', accessToken);

      // Close existing socket if any
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        intentionalCloseRef.current = true;
        socketRef.current.close();
      }

      const socket = new WebSocket(wsUrl.toString());
      socketRef.current = socket;

      socket.onopen = () => {
        console.log('[WS] Connected');
        setIsConnected(true);
        intentionalCloseRef.current = false;
        onOpen?.();
      };

      socket.onmessage = (event: MessageEvent<string>): void => {
        try {
          const data = JSON.parse(event.data) as IncomingWebSocketMessage;
          onMessage?.(data);
        } catch (err) {
          console.error('[WS] Parse error:', err);
        }
      };

      socket.onerror = (err) => {
        console.error('[WS] Error:', err);
        setIsConnected(false);
        onError?.(err);
      };

      socket.onclose = (event) => {
        console.log('[WS] Closed. Code:', event.code);
        setIsConnected(false);
        onClose?.(event);

        // Auto-reconnect after delay (except for intentional closes)
        if (!intentionalCloseRef.current && event.code !== NORMAL_CLOSURE && event.code !== GOING_AWAY) {
          console.log(`[WS] Scheduling reconnection in ${RECONNECT_DELAY_MS}ms...`);
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('[WS] Attempting reconnection...');
            connectRef.current?.();
          }, RECONNECT_DELAY_MS);
        }
      };

    } catch (err) {
      console.error('[WS] Connection failed:', err);
      setIsConnected(false);

      // Avoid repeated 401 spam loops. Auth flow will re-enable connection when ready.
      if (!shouldConnect) {
        return;
      }
      if (((err as Error)?.message || '').toLowerCase().includes('unauthorized')) {
        return;
      }

      // Retry connection after delay on connection failure
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('[WS] Retrying after connection failure...');
        connectRef.current?.();
      }, RETRY_DELAY_MS);
    }
  }, [playerId, onMessage, onError, onClose, onOpen, shouldConnect]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    if (shouldConnect) {
      connect();
    }

    return () => {
      // Cleanup on unmount
      intentionalCloseRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (socketRef.current) {
        socketRef.current.close(NORMAL_CLOSURE);
      }
      setIsConnected(false);
    };
  }, [connect, shouldConnect]);

  const send = useCallback((data: OutgoingWebSocketMessage): void => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(data));
    } else {
      console.warn('[WS] Cannot send, socket not open');
    }
  }, []);

  const disconnect = useCallback((code: number = NORMAL_CLOSURE, reason: string = 'logout'): void => {
    intentionalCloseRef.current = true;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (socketRef.current) {
      try {
        socketRef.current.close(code, reason);
      } catch {
        // some browsers are fussy about close(reason)
        socketRef.current.close(code);
      }
      socketRef.current = null;
    }

    setIsConnected(false);
  }, []);


  return { send, isConnected, disconnect };
}
