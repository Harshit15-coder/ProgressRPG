// src/utils/api.ts
import { jwtDecode } from "jwt-decode";
import { API_BASE_URL } from "../config";
import type { AccessTokenResponse } from "../types/api";
import { clearAuthStorage, getStoredAuthTokens, updateStoredAccessToken } from "./authStorage";

const API_URL = `${API_BASE_URL}/api/v1`;

type ResponseType = "json" | "blob" | "text" | "raw";

interface ApiFetchOptions extends Omit<RequestInit, "headers"> {
  responseType?: ResponseType;
  headers?: Record<string, string>;
}

function isTokenExpiringSoon(token: string, bufferSeconds = 60): boolean {
  try {
    const { exp } = jwtDecode<{ exp: number }>(token);
    const now = Date.now() / 1000;
    return exp - now < bufferSeconds;
  } catch {
    return true; // treat invalid token as expiring
  }
}

function clearAuthAndRedirect(): void {
  clearAuthStorage();
  window.dispatchEvent(new CustomEvent("auth:expired"));
}

async function refreshAccessToken(refreshToken: string): Promise<string | false> {
  try {
    const response = await fetch(`${API_URL}/auth/jwt/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh: refreshToken }),
    });

    if (!response.ok) throw new Error("Failed to refresh access token");

    const data: Partial<AccessTokenResponse> = await response.json();

    if (data.access_token) {
      updateStoredAccessToken(data.access_token);
      return data.access_token;
    }
    throw new Error("No access token returned from refresh");
  } catch {
    return false;
  }
}

// Callers of apiFetch can fire concurrently (e.g. several components mounting
// at once). Without this, each one independently notices the token is
// expiring and starts its own refresh request. Sharing the in-flight promise
// means only the first caller actually hits the network; the rest await the
// same result.
let inFlightRefresh: Promise<string | false> | null = null;

function refreshAccessTokenOnce(refreshToken: string): Promise<string | false> {
  if (!inFlightRefresh) {
    inFlightRefresh = refreshAccessToken(refreshToken).finally(() => {
      inFlightRefresh = null;
    });
  }
  return inFlightRefresh;
}

export async function getValidAccessToken(): Promise<string> {
  const { accessToken, refreshToken } = getStoredAuthTokens();
  if (!accessToken || !refreshToken) {
    clearAuthAndRedirect();
    throw new Error("Missing tokens");
  }

  if (isTokenExpiringSoon(accessToken)) {
    const newAccess = await refreshAccessTokenOnce(refreshToken);
    if (!newAccess) {
      clearAuthAndRedirect();
      throw new Error("Token refresh failed");
    }
    return newAccess;
  }

  return accessToken;
}

// Overloads for different responseType values
export async function apiFetch(path: string, options: ApiFetchOptions & { responseType: "blob" }, explicitAccessToken?: string | null): Promise<Blob>;
export async function apiFetch(path: string, options: ApiFetchOptions & { responseType: "text" }, explicitAccessToken?: string | null): Promise<string>;
export async function apiFetch(path: string, options: ApiFetchOptions & { responseType: "raw" }, explicitAccessToken?: string | null): Promise<Response>;
export async function apiFetch<T = unknown>(path: string, options?: ApiFetchOptions, explicitAccessToken?: string | null): Promise<T>;

export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {},
  explicitAccessToken: string | null = null
): Promise<T | Blob | string | Response> {
  try {
    const { responseType = "json", ...fetchOptions } = options;
    const accessToken = explicitAccessToken || (await getValidAccessToken());

    const headers: Record<string, string> = {
      ...(fetchOptions.headers || {}),
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };

    const response = await fetch(`${API_URL}${path}`, {
      ...fetchOptions,
      headers,
    });

    if (response.status === 401) {
      clearAuthAndRedirect();
      throw new Error("Unauthorized");
    }

    if (response.status === 503) {
      window.location.href = "/maintenance";
      return Promise.reject(new Error("Maintenance mode"));
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "API error");
    }

    switch (responseType) {
      case "blob":
        return response.blob();
      case "text":
        return response.text();
      case "raw":
        return response;
      case "json":
      default:
        return response.json() as Promise<T>;
    }
  } catch (err) {
    if (err instanceof TypeError) {
      window.location.href = "/unavailable";
      return Promise.reject(err);
    }
    console.error("apiFetch error:", err);
    throw err;
  }
}
