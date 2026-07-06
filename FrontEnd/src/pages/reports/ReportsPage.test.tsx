import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { api, type Report } from "@/api";
import { ToastProvider } from "@/context/ToastContext";

import { ReportsPage } from "./ReportsPage";

vi.mock("@/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      reports: {
        ...actual.api.reports,
        history: vi.fn(),
        generate: vi.fn(),
      },
    },
  };
});

const mockedReports = api.reports as unknown as {
  history: Mock;
  generate: Mock;
};

function buildReport(id: number, period: Report["period"]): Report {
  return {
    id,
    period,
    source: "manual",
    period_start: "2026-07-07T00:00:00Z",
    period_end: "2026-07-07T23:59:59Z",
    metrics_json: {
      tasks: { planned: 5, completed: 4 },
      metrics: [],
    },
    narrative: "Summary line",
    next_steps: "- Keep going",
    created_at: "2026-07-07T18:00:00Z",
  };
}

function renderPage(path = "/reports") {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/reports/day/:historyDate" element={<div>Viewer route</div>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe("ReportsPage", () => {
  beforeEach(() => {
    mockedReports.history.mockReset();
    mockedReports.generate.mockReset();

    mockedReports.history.mockResolvedValue([
      {
        history_date: "2026-07-07",
        versions_count: 3,
        latest_report_id: 11,
        latest_period: "daily",
        latest_created_at: "2026-07-07T18:00:00Z",
        latest_narrative_snippet: "Latest daily reflection",
        report_periods: ["daily", "weekly"],
      },
    ]);

    mockedReports.generate.mockResolvedValue(buildReport(11, "daily"));
  });

  it("loads grouped history and opens dedicated viewer for a date card", async () => {
    const user = userEvent.setup();
    renderPage("/reports?period=daily");

    await waitFor(() => {
      expect(mockedReports.history).toHaveBeenCalledWith("daily");
    });

    const snippet = await screen.findByText("Latest daily reflection");
    await user.click(snippet.closest("button") as HTMLButtonElement);

    expect(await screen.findByText("Viewer route")).toBeInTheDocument();
  });

  it("generates a report and navigates to the viewer", async () => {
    mockedReports.history
      .mockResolvedValueOnce([
        {
          history_date: "2026-07-07",
          versions_count: 1,
          latest_report_id: 7,
          latest_period: "daily",
          latest_created_at: "2026-07-07T12:00:00Z",
          latest_narrative_snippet: "Earlier summary",
          report_periods: ["daily"],
        },
      ])
      .mockResolvedValueOnce([
        {
          history_date: "2026-07-07",
          versions_count: 2,
          latest_report_id: 11,
          latest_period: "daily",
          latest_created_at: "2026-07-07T18:00:00Z",
          latest_narrative_snippet: "Latest summary",
          report_periods: ["daily"],
        },
      ]);

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Generate" }));

    await waitFor(() => {
      expect(mockedReports.generate).toHaveBeenCalledWith({ period: "daily" });
    });
    expect(await screen.findByText("Viewer route")).toBeInTheDocument();
  });
});
