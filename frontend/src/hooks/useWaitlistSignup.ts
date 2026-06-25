// hooks/useWaitlistSignup.ts
import { useCallback } from 'react';

import { API_BASE_URL } from '../config';

const API_URL = `${API_BASE_URL}/api/v1/waitlist_signup/`;

type ApiData = Record<string, unknown> | null;

type WaitlistResult =
  | { success: true; message: string; state: string | null }
  | { success: false; errorMessage: string };

async function readResponseJson(response: Response): Promise<ApiData> {
  try {
    return await response.json() as ApiData;
  } catch {
    return null;
  }
}

function getMessage(data: ApiData, fallback: string): string {
  if (!data || typeof data !== 'object') {
    return fallback;
  }

  if (typeof data.detail === 'string' && data.detail) {
    return data.detail;
  }

  const firstEntry = Object.values(data)[0];
  if (Array.isArray(firstEntry) && firstEntry[0]) {
    return String(firstEntry[0]);
  }

  return fallback;
}

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

      const data = await readResponseJson(response);

      if (!response.ok) {
        return {
          success: false,
          errorMessage: getMessage(
            data,
            'Unable to join the waitlist right now. Please try again later.'
          ),
        };
      }

      return {
        success: true,
        message: getMessage(data, "You're on the list! We'll be in touch soon."),
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
