import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jwtDecode } from "jwt-decode";

import { getValidAccessToken, setUnauthorizedHandler } from "./api";
import { getStoredAuthTokens, storeAuthTokens } from "./authStorage";

vi.mock("jwt-decode", () => ({
  jwtDecode: vi.fn(),
}));

describe("getValidAccessToken", () => {
  beforeEach(() => {
    storeAuthTokens("expiring-token", "refresh-token", true);
    (jwtDecode as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      exp: Date.now() / 1000 - 10, // already expired
    });
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setUnauthorizedHandler(null);
    vi.clearAllMocks();
  });

  it("stores the refreshed access token returned as access_token", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "new-access-token" }),
    });

    const token = await getValidAccessToken();

    expect(token).toBe("new-access-token");
    expect(getStoredAuthTokens().accessToken).toBe("new-access-token");
  });

  it("logs the user out when the refresh response is missing access_token", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ access: "unexpected-shape" }),
    });

    const unauthorizedHandler = vi.fn();
    setUnauthorizedHandler(unauthorizedHandler);

    await expect(getValidAccessToken()).rejects.toThrow("Token refresh failed");

    expect(unauthorizedHandler).toHaveBeenCalled();
    expect(getStoredAuthTokens().accessToken).toBeNull();
  });
});
