// websockets/handleGlobalWebSocketEvent.ts
import type { IncomingWebSocketMessage } from '../types';
import type { MaintenanceState } from '../context/MaintenanceContext';

interface HandleGlobalWebSocketEventOptions {
  showToast?: (message: string) => void;
  maintenanceRefetch?: () => Promise<MaintenanceState>;
  setMaintenance?: (state: MaintenanceState) => void;
}

/** Extended WS message shape for 'action' type messages from the server. */
interface ActionWebSocketMessage extends Record<string, unknown> {
  type: string;
  action?: string;
  message?: string;
  maintenance_active?: boolean;
  name?: string;
  description?: string;
  start_time?: string | null;
  end_time?: string | null;
}

export async function handleGlobalWebSocketEvent(
  data: IncomingWebSocketMessage,
  { showToast, maintenanceRefetch, setMaintenance }: HandleGlobalWebSocketEventOptions,
): Promise<void> {
  // Cast to a looser type for the switch — individual cases narrow as needed.
  const msg = data as ActionWebSocketMessage;

  switch (msg.type) {
    case 'notification':
      showToast?.(msg.message ?? '');
      break;
    case 'console.log':
      console.log('[WS]', msg.message);
      break;
    case 'pong':
      console.log('[WS] Pong!');
      break;
    case 'server_message':
      break;

    case 'action':
      switch (msg.action) {

        case 'refresh':
          if (msg.maintenance_active !== undefined) {
            if (msg.maintenance_active) {
              setMaintenance?.({
                active: true,
                details: {
                  name: msg.name,
                  description: msg.description,
                  startTime: msg.start_time,
                  endTime: msg.end_time,
                },
              });
            } else {
              setMaintenance?.({ active: false, details: null });
            }
            return;
          }

          // Fallback: refetch from API and act on the returned value
          if (maintenanceRefetch) {
            try {
              const result = await maintenanceRefetch();
              if (result?.active) {
                setMaintenance?.(result);
              } else {
                setMaintenance?.({ active: false, details: null });
              }
            } catch (err) {
              console.warn('[WS] Error refetching maintenance status', err);
            }
          } else {
            console.warn('[WS] maintenanceRefetch not provided, cannot refresh.');
          }
          return;
        case 'load-game':
          console.log("[WS] Django consumer 'load-game' message not currently in use.");
          break;
        default:
          console.warn('[WS] Unknown action:', data);
      }
      break;

    default:
      console.warn('[WS] Unknown type:', data);
  }
}
