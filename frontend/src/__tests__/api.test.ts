import { describe, it, expect, vi, afterEach } from "vitest";
import { cancelRun } from "@/lib/api";

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
