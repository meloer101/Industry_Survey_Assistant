import { describe, it, expect, vi, afterEach } from "vitest";
import { authHeaders, cancelRun, createSession, retryWithBackoff } from "@/lib/api";
import { shouldLogInDev } from "@/lib/logging";

describe("cancelRun", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends DELETE to the backend run cancellation endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const getToken = vi.fn().mockResolvedValue("session-token");

    await cancelRun(getToken, "app", "user_1", "s_1");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/apps/app/users/user_1/sessions/s_1/run",
      expect.objectContaining({
        method: "DELETE",
        headers: { Authorization: "Bearer session-token" },
      }),
    );
  });
});

describe("authHeaders", () => {
  it("builds bearer auth headers from the Clerk session token", async () => {
    const getToken = vi.fn().mockResolvedValue("session-token");

    await expect(authHeaders(getToken)).resolves.toEqual({
      Authorization: "Bearer session-token",
    });
  });
});

describe("createSession", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the Clerk user id in the ADK session path", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ userId: "user_1", id: "session_1", appName: "app" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const getToken = vi.fn().mockResolvedValue("session-token");

    await createSession(getToken, "user_1");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/^\/api\/apps\/app\/users\/user_1\/sessions\//),
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer session-token",
        },
      }),
    );
  });
});

describe("retryWithBackoff logging", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not write retry warnings outside dev logging mode", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    let attempts = 0;

    await retryWithBackoff(
      async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("temporary");
        return "ok";
      },
      2,
      5000,
    );

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("enables logs only for development mode", () => {
    expect(shouldLogInDev({ DEV: true, MODE: "development" })).toBe(true);
    expect(shouldLogInDev({ DEV: false, MODE: "production" })).toBe(false);
    expect(shouldLogInDev({ DEV: true, MODE: "test" })).toBe(false);
  });
});
