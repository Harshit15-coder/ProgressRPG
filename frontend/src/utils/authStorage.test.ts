import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearAuthStorage,
  getStoredAccessToken,
  getStoredAuthTokens,
  storeAuthTokens,
  updateStoredAccessToken,
} from './authStorage';

describe('authStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('stores remembered tokens in localStorage', () => {
    storeAuthTokens('access-token', 'refresh-token', true);

    expect(localStorage.getItem('accessToken')).toBe('access-token');
    expect(localStorage.getItem('refreshToken')).toBe('refresh-token');
    expect(sessionStorage.getItem('accessToken')).toBeNull();
    expect(sessionStorage.getItem('refreshToken')).toBeNull();
  });

  it('stores short-session tokens in sessionStorage', () => {
    storeAuthTokens('access-token', 'refresh-token', false);

    expect(sessionStorage.getItem('accessToken')).toBe('access-token');
    expect(sessionStorage.getItem('refreshToken')).toBe('refresh-token');
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });

  it('reads tokens from whichever auth storage is active', () => {
    sessionStorage.setItem('accessToken', 'session-access');
    sessionStorage.setItem('refreshToken', 'session-refresh');

    expect(getStoredAuthTokens()).toEqual({
      accessToken: 'session-access',
      refreshToken: 'session-refresh',
    });
    expect(getStoredAccessToken()).toBe('session-access');
  });

  it('does not clobber an existing remembered session when storing a short session', () => {
    // Simulates another tab having a remembered (localStorage) session active.
    localStorage.setItem('accessToken', 'other-tab-access');
    localStorage.setItem('refreshToken', 'other-tab-refresh');

    storeAuthTokens('this-tab-access', 'this-tab-refresh', false);

    // The other tab's remembered tokens must survive.
    expect(localStorage.getItem('accessToken')).toBe('other-tab-access');
    expect(localStorage.getItem('refreshToken')).toBe('other-tab-refresh');
    // But this tab must read back its own short-session tokens, not the
    // remembered ones sitting in localStorage.
    expect(getStoredAuthTokens()).toEqual({
      accessToken: 'this-tab-access',
      refreshToken: 'this-tab-refresh',
    });
  });

  it('updates refreshed access tokens in the active storage', () => {
    storeAuthTokens('old-access', 'refresh-token', false);

    updateStoredAccessToken('new-access');

    expect(sessionStorage.getItem('accessToken')).toBe('new-access');
    expect(localStorage.getItem('accessToken')).toBeNull();
  });

  it('updates the access token in sessionStorage rather than a stale localStorage bundle', () => {
    localStorage.setItem('accessToken', 'other-tab-access');
    localStorage.setItem('refreshToken', 'other-tab-refresh');
    storeAuthTokens('this-tab-access', 'this-tab-refresh', false);

    updateStoredAccessToken('refreshed-access');

    expect(sessionStorage.getItem('accessToken')).toBe('refreshed-access');
    expect(localStorage.getItem('accessToken')).toBe('other-tab-access');
  });

  it('clears a remembered session from localStorage without touching another tab session', () => {
    storeAuthTokens('local-access', 'local-refresh', true);

    clearAuthStorage();

    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });

  it('clears a session-scoped login from sessionStorage without clobbering another tab\'s remembered session', () => {
    // Simulates another tab having a remembered (localStorage) session active.
    localStorage.setItem('accessToken', 'other-tab-access');
    localStorage.setItem('refreshToken', 'other-tab-refresh');
    storeAuthTokens('this-tab-access', 'this-tab-refresh', false);

    clearAuthStorage();

    expect(sessionStorage.getItem('accessToken')).toBeNull();
    expect(sessionStorage.getItem('refreshToken')).toBeNull();
    // The other tab's remembered tokens must survive a same-tab logout.
    expect(localStorage.getItem('accessToken')).toBe('other-tab-access');
    expect(localStorage.getItem('refreshToken')).toBe('other-tab-refresh');
  });
});
