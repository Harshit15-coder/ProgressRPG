// hooks/usePasswordReset.ts
import { useCallback } from 'react';
import { API_BASE_URL } from '../config';
import { extractApiMessage, readJsonSafe, type ApiData } from '../utils/apiErrors';

const API_URL = `${API_BASE_URL}/api/v1/auth`;

type RequestResetResult =
  | { success: true; message: string }
  | { success: false; errors: ApiData; errorMessage: string };

type ConfirmResetResult =
  | { success: true; message: string }
  | { success: false; errors: ApiData; errorMessage: string };

export default function usePasswordReset() {
  const requestPasswordReset = useCallback(async (email: string): Promise<RequestResetResult> => {
    try {
      const response = await fetch(`${API_URL}/password/reset/`, {
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
          errors: data,
          errorMessage: extractApiMessage(data, 'Unable to send a reset link right now.'),
        };
      }

      return {
        success: true,
        message:
          (typeof data?.detail === 'string' ? data.detail : null) ||
          'If an account exists for that email, a password reset link has been sent.',
      };
    } catch (error) {
      console.error('[usePasswordReset] Unexpected request error:', error);
      return {
        success: false,
        errors: null,
        errorMessage: 'Unable to send a reset link right now.',
      };
    }
  }, []);

  const confirmPasswordReset = useCallback(async ({ uid, token, password1, password2 }: { uid: string; token: string; password1: string; password2: string }): Promise<ConfirmResetResult> => {
    try {
      const response = await fetch(`${API_URL}/password/reset/confirm/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          uid,
          token,
          new_password1: password1,
          new_password2: password2,
        }),
      });

      const data = await readJsonSafe(response);

      if (!response.ok) {
        return {
          success: false,
          errors: data,
          errorMessage: extractApiMessage(data, 'Unable to reset your password.'),
        };
      }

      return {
        success: true,
        message: (typeof data?.detail === 'string' ? data.detail : null) || 'Your password has been reset successfully.',
      };
    } catch (error) {
      console.error('[usePasswordReset] Unexpected confirm error:', error);
      return {
        success: false,
        errors: null,
        errorMessage: 'Unable to reset your password.',
      };
    }
  }, []);

  return { requestPasswordReset, confirmPasswordReset };
}
