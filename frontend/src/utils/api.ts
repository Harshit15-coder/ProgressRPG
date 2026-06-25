// src/utils/api.ts
import { jwtDecode } from "jwt-decode";
import { API_BASE_URL } from "../config";

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
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");

  // Give user feedback before redirect
  console.warn("[Auth] Session expired, redirecting to login...");

  // Small delay to allow any error messages to display
  setTimeout(() => {
    window.location.href = "/login";
  }, 500);
}

async function refreshAccessToken(refreshToken: string): Promise<string | false> {
  try {
    const response = await fetch(`${API_URL}/auth/jwt/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh: refreshToken }),
    });

    if (!response.ok) throw new Error("Failed to refresh access token");

    const data: { access?: string } = await response.json();

    if (data.access) {
      localStorage.setItem("accessToken", data.access);
      return data.access;
    }
    throw new Error("No access token returned from refresh");
  } catch {
    return false;
  }
}

export async function getValidAccessToken(): Promise<string> {
  const accessToken = localStorage.getItem("accessToken");
  const refreshToken = localStorage.getItem("refreshToken");
  if (!accessToken || !refreshToken) throw new Error("Missing tokens");

  if (isTokenExpiringSoon(accessToken)) {
    const newAccess = await refreshAccessToken(refreshToken);
    if (!newAccess) throw new Error("Token refresh failed");
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

    if (!accessToken) {
      throw new Error("No access token available for request");
    }

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
      // optionally parse JSON if included
      const data: { detail?: string } = await response.json().catch(() => ({}));
      // redirect or show toast
      window.location.href = "/maintenance";
      return Promise.reject(new Error(data.detail || "Maintenance mode"));
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
