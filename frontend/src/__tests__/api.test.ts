import { describe, it, expect, vi, afterEach } from "vitest";
import { cancelRun, retryWithBackoff } from "@/lib/api";
import { shouldLogInDev } from "@/lib/logging";

describe("cancelRun", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends DELETE to the backend run cancellation endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await cancelRun("app", "u_1", "s_1");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/apps/app/users/u_1/sessions/s_1/run",
      expect.objectContaining({ method: "DELETE" }),
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
