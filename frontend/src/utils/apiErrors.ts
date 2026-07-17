export type ApiData = Record<string, unknown> | null;

export async function readJsonSafe(response: Response): Promise<ApiData> {
  try {
    return await response.json() as ApiData;
  } catch {
    return null;
  }
}

// Pulls a human-readable message out of a JSON API response: DRF's `detail`
// field when present, otherwise the first value of the first field-error
// array (DRF's shape for validation errors), otherwise `fallback`. Used for
// both success and error responses, since both can carry a `detail` message.
export function extractApiMessage(data: ApiData, fallback: string): string {
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
