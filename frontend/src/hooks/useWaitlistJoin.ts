// hooks/useWaitlistJoin.ts
import { useCallback } from 'react';

import { API_BASE_URL } from '../config';
import { extractApiMessage, readJsonSafe } from '../utils/apiErrors';

const API_URL = `${API_BASE_URL}/api/v1/waitlist_join/`;

type WaitlistJoinResult =
  | { success: true; message: string }
  | { success: false; errorMessage: string };

export default function useWaitlistJoin() {
  const joinWaitlist = useCallback(async (email: string): Promise<WaitlistJoinResult> => {
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await readJsonSafe(response);

      if (!response.ok) {
        return {
          success: false,
          errorMessage: extractApiMessage(
            data,
            'Unable to join the waitlist right now. Please try again later.'
          ),
        };
      }

      return {
        success: true,
        message: extractApiMessage(data, "You're on the waitlist."),
      };
    } catch (error) {
      console.error('[useWaitlistJoin] Unexpected request error:', error);
      return {
        success: false,
        errorMessage: 'Unable to join the waitlist right now. Please try again later.',
      };
    }
  }, []);

  return { joinWaitlist };
}
