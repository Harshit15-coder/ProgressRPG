const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';

interface TokenBundle {
  accessToken: string | null;
  refreshToken: string | null;
}

function getTokenBundle(storage: Storage): { accessToken: string; refreshToken: string } | null {
  const accessToken = storage.getItem(ACCESS_TOKEN_KEY);
  const refreshToken = storage.getItem(REFRESH_TOKEN_KEY);

  if (!accessToken || !refreshToken) {
    return null;
  }

  return { accessToken, refreshToken };
}

export function getStoredAuthTokens(): TokenBundle {
  return (
    getTokenBundle(localStorage) ||
    getTokenBundle(sessionStorage) || {
      accessToken: null,
      refreshToken: null,
    }
  );
}

export function storeAuthTokens(accessToken: string, refreshToken: string, rememberMe = true): void {
  clearAuthStorage();
  const storage = rememberMe ? localStorage : sessionStorage;

  storage.setItem(ACCESS_TOKEN_KEY, accessToken);
  storage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function updateStoredAccessToken(accessToken: string): void {
  if (localStorage.getItem(REFRESH_TOKEN_KEY)) {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    return;
  }

  if (sessionStorage.getItem(REFRESH_TOKEN_KEY)) {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  }
}

export function getStoredAccessToken(): string | null {
  return getStoredAuthTokens().accessToken;
}

export function clearAuthStorage(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
}
