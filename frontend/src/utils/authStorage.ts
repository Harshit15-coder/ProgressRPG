const AUTH_SESSION_KEY = 'authSession';

type Persistence = 'local' | 'session';

interface SessionDescriptor {
  accessToken: string;
  refreshToken: string;
  persistence: Persistence;
}

interface TokenBundle {
  accessToken: string | null;
  refreshToken: string | null;
}

function readDescriptor(storage: Storage): SessionDescriptor | null {
  const raw = storage.getItem(AUTH_SESSION_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<SessionDescriptor>;
    if (!parsed.accessToken || !parsed.refreshToken) return null;

    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      persistence: parsed.persistence === 'local' ? 'local' : 'session',
    };
  } catch {
    return null;
  }
}

function writeDescriptor(storage: Storage, descriptor: SessionDescriptor): void {
  storage.setItem(AUTH_SESSION_KEY, JSON.stringify(descriptor));
}

// The storage this tab currently reads/writes its own session from. A
// descriptor in sessionStorage (inherently per-tab) means this tab explicitly
// chose a session-scoped login; otherwise it defers to localStorage.
function getActiveStorage(): Storage {
  return readDescriptor(sessionStorage) ? sessionStorage : localStorage;
}

function getInactiveStorage(storage: Storage): Storage {
  return storage === sessionStorage ? localStorage : sessionStorage;
}

export function getStoredAuthTokens(): TokenBundle {
  const empty = { accessToken: null, refreshToken: null };
  const active = getActiveStorage();
  const descriptor = readDescriptor(active) ?? readDescriptor(getInactiveStorage(active));

  return descriptor ? { accessToken: descriptor.accessToken, refreshToken: descriptor.refreshToken } : empty;
}

export function storeAuthTokens(accessToken: string, refreshToken: string, rememberMe = true): void {
  if (rememberMe) {
    // Clearing this tab's sessionStorage descriptor only affects this tab, so
    // it can't clobber a remembered session another tab is relying on.
    sessionStorage.removeItem(AUTH_SESSION_KEY);
    writeDescriptor(localStorage, { accessToken, refreshToken, persistence: 'local' });
    return;
  }

  // Deliberately leave localStorage untouched — another tab may hold a valid
  // remembered session there. This tab's own sessionStorage descriptor makes
  // it read back its own bundle regardless of what's in localStorage.
  writeDescriptor(sessionStorage, { accessToken, refreshToken, persistence: 'session' });
}

export function updateStoredAccessToken(accessToken: string): void {
  const active = getActiveStorage();
  const activeDescriptor = readDescriptor(active);
  if (activeDescriptor) {
    writeDescriptor(active, { ...activeDescriptor, accessToken });
    return;
  }

  const inactive = getInactiveStorage(active);
  const inactiveDescriptor = readDescriptor(inactive);
  if (inactiveDescriptor) {
    writeDescriptor(inactive, { ...inactiveDescriptor, accessToken });
  }
}

export function getStoredAccessToken(): string | null {
  return getStoredAuthTokens().accessToken;
}

export function clearAuthStorage(): void {
  // Only clear the storage this tab is actually using. A session-scoped tab
  // must never touch localStorage — another tab may hold a valid remembered
  // session there that this tab's logout/expiry has nothing to do with.
  getActiveStorage().removeItem(AUTH_SESSION_KEY);
}
