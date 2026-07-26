// hooks/useWaitlistSignup.ts
import { useCallback } from 'react';

import { API_BASE_URL } from '../config';
import { extractApiMessage, readJsonSafe } from '../utils/apiErrors';

const API_URL = `${API_BASE_URL}/api/v1/waitlist_signup/`;

type WaitlistResult =
  | { success: true; message: string; state: string | null }
  | { success: false; errorMessage: string };

export default function useWaitlistSignup() {
  const requestWaitlistSignup = useCallback(async (email: string): Promise<WaitlistResult> => {
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
        message: extractApiMessage(data, "You're on the list! We'll be in touch soon."),
        state: (typeof data?.state === 'string' ? data.state : null),
      };
    } catch (error) {
      console.error('[useWaitlistSignup] Unexpected request error:', error);
      return {
        success: false,
        errorMessage: 'Unable to join the waitlist right now. Please try again later.',
      };
    }
  }, []);

  return { requestWaitlistSignup };
}
