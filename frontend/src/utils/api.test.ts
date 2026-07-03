import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jwtDecode } from "jwt-decode";

import { getValidAccessToken } from "./api";

vi.mock("jwt-decode", () => ({
  jwtDecode: vi.fn(),
}));

describe("getValidAccessToken", () => {
  beforeEach(() => {
    localStorage.setItem("accessToken", "expiring-token");
    localStorage.setItem("refreshToken", "refresh-token");
    (jwtDecode as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      exp: Date.now() / 1000 - 10, // already expired
    });
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("stores the refreshed access token returned as access_token", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "new-access-token" }),
    });

    const token = await getValidAccessToken();

    expect(token).toBe("new-access-token");
    expect(localStorage.getItem("accessToken")).toBe("new-access-token");
  });

  it("logs the user out when the refresh response is missing access_token", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ access: "unexpected-shape" }),
    });

    const expiredHandler = vi.fn();
    window.addEventListener("auth:expired", expiredHandler);

    await expect(getValidAccessToken()).rejects.toThrow("Token refresh failed");

    expect(expiredHandler).toHaveBeenCalled();
    expect(localStorage.getItem("accessToken")).toBeNull();

    window.removeEventListener("auth:expired", expiredHandler);
  });
});
