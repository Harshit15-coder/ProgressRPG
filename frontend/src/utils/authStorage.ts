const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';
// sessionStorage is inherently per-tab and survives reloads within that tab, so it's a
// safe place to record "this tab logged in without remember me" without leaking the
// preference to other tabs sharing the same localStorage.
const SESSION_MODE_KEY = 'authStorageMode';

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

function prefersSessionStorage(): boolean {
  return sessionStorage.getItem(SESSION_MODE_KEY) === 'session';
}

export function getStoredAuthTokens(): TokenBundle {
  const empty = { accessToken: null, refreshToken: null };

  if (prefersSessionStorage()) {
    return getTokenBundle(sessionStorage) || getTokenBundle(localStorage) || empty;
  }

  return getTokenBundle(localStorage) || getTokenBundle(sessionStorage) || empty;
}

export function storeAuthTokens(accessToken: string, refreshToken: string, rememberMe = true): void {
  if (rememberMe) {
    // Clearing sessionStorage here only affects this tab, so it can't clobber a
    // remembered session another tab is relying on.
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    sessionStorage.removeItem(SESSION_MODE_KEY);
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    return;
  }

  // Deliberately leave localStorage untouched — another tab may hold a valid
  // remembered session there. The mode marker makes this tab prefer its own
  // sessionStorage bundle regardless of what's in localStorage.
  sessionStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  sessionStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  sessionStorage.setItem(SESSION_MODE_KEY, 'session');
}

export function updateStoredAccessToken(accessToken: string): void {
  if (prefersSessionStorage() && sessionStorage.getItem(REFRESH_TOKEN_KEY)) {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    return;
  }

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
  // Only clear the storage this tab is actually using. A session-scoped tab
  // must never touch localStorage — another tab may hold a valid remembered
  // session there that this tab's logout/expiry has nothing to do with.
  if (prefersSessionStorage()) {
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    sessionStorage.removeItem(SESSION_MODE_KEY);
    return;
  }

  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}
