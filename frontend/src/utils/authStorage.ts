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

// The storage this tab currently reads/writes its own tokens from. The other
// storage may still hold a different tab's session and must be touched only
// as an explicit fallback, never treated as this tab's own bundle.
function getActiveStorage(): Storage {
  return prefersSessionStorage() ? sessionStorage : localStorage;
}

function getInactiveStorage(storage: Storage): Storage {
  return storage === sessionStorage ? localStorage : sessionStorage;
}

export function getStoredAuthTokens(): TokenBundle {
  const empty = { accessToken: null, refreshToken: null };
  const active = getActiveStorage();

  return getTokenBundle(active) || getTokenBundle(getInactiveStorage(active)) || empty;
}

function writeTokenPair(storage: Storage, accessToken: string, refreshToken: string): void {
  storage.setItem(ACCESS_TOKEN_KEY, accessToken);
  storage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function storeAuthTokens(accessToken: string, refreshToken: string, rememberMe = true): void {
  if (rememberMe) {
    // Clearing sessionStorage here only affects this tab, so it can't clobber a
    // remembered session another tab is relying on.
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    sessionStorage.removeItem(SESSION_MODE_KEY);
    writeTokenPair(localStorage, accessToken, refreshToken);
    return;
  }

  // Deliberately leave localStorage untouched — another tab may hold a valid
  // remembered session there. The mode marker makes this tab prefer its own
  // sessionStorage bundle regardless of what's in localStorage.
  writeTokenPair(sessionStorage, accessToken, refreshToken);
  sessionStorage.setItem(SESSION_MODE_KEY, 'session');
}

export function updateStoredAccessToken(accessToken: string): void {
  const active = getActiveStorage();
  if (active.getItem(REFRESH_TOKEN_KEY)) {
    active.setItem(ACCESS_TOKEN_KEY, accessToken);
    return;
  }

  const inactive = getInactiveStorage(active);
  if (inactive.getItem(REFRESH_TOKEN_KEY)) {
    inactive.setItem(ACCESS_TOKEN_KEY, accessToken);
  }
}

export function getStoredAccessToken(): string | null {
  return getStoredAuthTokens().accessToken;
}

export function clearAuthStorage(): void {
  // Only clear the storage this tab is actually using. A session-scoped tab
  // must never touch localStorage — another tab may hold a valid remembered
  // session there that this tab's logout/expiry has nothing to do with.
  const active = getActiveStorage();
  active.removeItem(ACCESS_TOKEN_KEY);
  active.removeItem(REFRESH_TOKEN_KEY);

  if (active === sessionStorage) {
    sessionStorage.removeItem(SESSION_MODE_KEY);
  }
}
