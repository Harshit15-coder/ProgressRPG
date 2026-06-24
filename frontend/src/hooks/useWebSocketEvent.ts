// hooks/useWebSocketEvent.ts
import { useEffect } from 'react';
import { useWebSocket } from './useWebSocket';
import type { IncomingWebSocketMessage } from '../types';

export function useWebSocketEvent(callback: ((data: IncomingWebSocketMessage) => void) | null | undefined): void {
  const { addEventHandler } = useWebSocket();

  useEffect(() => {
    if (!callback) return;
    const remove = addEventHandler(callback);
    return () => remove();
  }, [callback, addEventHandler]);
}
