import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Dispatch, ReactElement, ReactNode, SetStateAction } from 'react';
import { apiFetch } from "../utils/api";
import { clearAuthStorage, getStoredAuthTokens, storeAuthTokens } from '../utils/authStorage';
import { clearUserPreferences } from '../utils/userPreferences';
import type { User } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthContextValue {
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  user: User | null;
  setUser: Dispatch<SetStateAction<User | null>>;
  login: (accessToken: string, refreshToken: string, options?: { rememberMe?: boolean }) => Promise<unknown>;
  logout: () => void;
  /** Thin wrapper around apiFetch — use apiFetch directly for typed responses. */
  authFetch: <T = unknown>(path: string, options?: Parameters<typeof apiFetch>[1]) => Promise<T>;
  loading: boolean;
}

interface ProviderProps {
  children: ReactNode;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: ProviderProps): ReactElement {
  const [accessToken, setAccessToken] = useState<string | null>(() => getStoredAuthTokens().accessToken);
  const [refreshToken, setRefreshToken] = useState<string | null>(() => getStoredAuthTokens().refreshToken);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const isAuthenticated = user !== null;

  // Set by login() right before it updates accessToken/refreshToken, so the
  // verifyUser effect below (which reacts to those same tokens) can tell
  // "tokens just changed because login() already fetched /me/ itself" apart
  // from "tokens changed for some other reason and still need verifying" —
  // without this, every login fires the /me/ request twice.
  const justLoggedInRef = useRef(false);

  // Thin wrapper around apiFetch. Typed as a generic fn rather than `typeof apiFetch`
  // because the overloaded signature doesn't unify to a single assignable type.
  const authFetch = <T = unknown>(path: string, options?: Parameters<typeof apiFetch>[1]): Promise<T> => {
    return apiFetch<T>(path, options);
  };

  const logout = useCallback((): void => {
    clearAuthStorage();
    clearUserPreferences();
    setAccessToken(null);
    setRefreshToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    const handleAuthExpired = () => logout();
    window.addEventListener("auth:expired", handleAuthExpired);
    return () => window.removeEventListener("auth:expired", handleAuthExpired);
  }, [logout]);

  // Fetches the current user and applies it to state. Shared by the
  // initial-load/token-change verification below and by login(), so there's
  // one "did this session actually resolve to a user" path instead of two
  // that can drift apart.
  const loadCurrentUser = useCallback(async (onFailure: () => void): Promise<User | null> => {
    try {
      const data = await apiFetch<User>('/me/');
      setUser(data);
      return data;
    } catch {
      onFailure();
      return null;
    }
  }, []);

  useEffect(() => {
    async function verifyUser(): Promise<void> {
      if (justLoggedInRef.current) {
        justLoggedInRef.current = false;
        return;
      }

      if (!accessToken || !refreshToken) {
        setLoading(false);
        return;
      }

      setLoading(true);
      await loadCurrentUser(logout);
      setLoading(false);
    }

    verifyUser();
  }, [accessToken, refreshToken, loadCurrentUser, logout]);

  const login = async (
    accessToken: string,
    refreshToken: string,
    options: { rememberMe?: boolean } = {}
  ): Promise<unknown> => {
    const { rememberMe = false } = options;
    storeAuthTokens(accessToken, refreshToken, rememberMe);
    justLoggedInRef.current = true;
    setAccessToken(accessToken);
    setRefreshToken(refreshToken);
    setLoading(true);

    const data = await loadCurrentUser(() => setUser(null));
    setLoading(false);
    return data;
  };

  const value: AuthContextValue = {
    accessToken,
    refreshToken,
    isAuthenticated,
    user,
    setUser,
    login,
    logout,
    authFetch,
    loading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
