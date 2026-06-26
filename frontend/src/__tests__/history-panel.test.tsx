import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HistoryPanel } from "@/components/HistoryPanel";

describe("HistoryPanel pagination", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads additional history pages when requested", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          has_more: true,
          sessions: [
            {
              session_id: "s_1",
              update_time: "2026-05-30T00:00:00+00:00",
              research_plan: "first",
              title: "First Research",
              has_final_report: false,
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          has_more: false,
          sessions: [
            {
              session_id: "s_2",
              update_time: "2026-05-29T00:00:00+00:00",
              research_plan: "second",
              title: "Second Research",
              has_final_report: true,
            },
          ],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const getToken = vi.fn().mockResolvedValue("session-token");

    render(
      <HistoryPanel
        userId="u_1"
        isOpen={true}
        getToken={getToken}
        onToggle={() => undefined}
        onSelectSession={() => undefined}
      />,
    );

    await screen.findByText("First Research");

    fireEvent.click(screen.getByRole("button", { name: "加载更多历史记录" }));

    await screen.findByText("Second Research");
    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/history/u_1?limit=20&offset=1",
        { headers: { Authorization: "Bearer session-token" } },
      );
    });
  });
});
