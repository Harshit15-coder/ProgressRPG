import { createContext, useContext, useState, useEffect } from 'react';
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
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  // Thin wrapper around apiFetch. Typed as a generic fn rather than `typeof apiFetch`
  // because the overloaded signature doesn't unify to a single assignable type.
  const authFetch = <T = unknown>(path: string, options?: Parameters<typeof apiFetch>[1]): Promise<T> => {
    return apiFetch<T>(path, options);
  };

  useEffect(() => {
    const handleAuthExpired = () => logout();
    window.addEventListener("auth:expired", handleAuthExpired);
    return () => window.removeEventListener("auth:expired", handleAuthExpired);
  // logout is defined in the same render scope and only uses stable state setters
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    async function verifyUser(): Promise<void> {
      if (!accessToken || !refreshToken) {
        setLoading(false);
        setIsAuthenticated(false);
        return;
      }

      try {
        const data = await apiFetch<User>('/me/');
        setUser(data);
        setIsAuthenticated(true);
      } catch {
        logout();
      } finally {
        setLoading(false);
      }
    }

    verifyUser();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, refreshToken]);

  const login = async (
    accessToken: string,
    refreshToken: string,
    options: { rememberMe?: boolean } = {}
  ): Promise<unknown> => {
    const { rememberMe = false } = options;
    storeAuthTokens(accessToken, refreshToken, rememberMe);
    setAccessToken(accessToken);
    setRefreshToken(refreshToken);
    setLoading(true);

    // Fetch user info after login
    try {
      const data = await apiFetch<User>('/me/');
      setUser(data);
      setIsAuthenticated(true);
      return data;
    } catch {
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  const logout = (): void => {
    clearAuthStorage();
    clearUserPreferences();
    setAccessToken(null);
    setRefreshToken(null);
    setUser(null);
    setIsAuthenticated(false);
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
