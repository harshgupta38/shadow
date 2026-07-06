import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { api, type Report, type ReportAutomation } from "@/api";
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
        getAutomation: vi.fn(),
        updateAutomation: vi.fn(),
      },
      metrics: {
        ...actual.api.metrics,
        list: vi.fn(),
      },
      repetitiveTasks: {
        ...actual.api.repetitiveTasks,
        list: vi.fn(),
      },
    },
  };
});

const mockedReports = api.reports as unknown as {
  history: Mock;
  generate: Mock;
  getAutomation: Mock;
  updateAutomation: Mock;
};

const mockedMetrics = api.metrics as unknown as {
  list: Mock;
};

const mockedRepetitiveTasks = api.repetitiveTasks as unknown as {
  list: Mock;
};

function buildAutomation(overrides: Partial<ReportAutomation> = {}): ReportAutomation {
  return {
    enabled: true,
    daily_enabled: true,
    daily_time: "23:55",
    weekly_enabled: true,
    weekly_day: "saturday",
    weekly_time: "23:55",
    include_plan_snapshot: true,
    include_goals_snapshot: true,
    include_habits_snapshot: true,
    include_metrics_snapshot: true,
    include_missed_tasks_snapshot: true,
    include_streaks_snapshot: true,
    selected_metric_ids: [],
    selected_habit_ids: [],
    ...overrides,
  };
}

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
    mockedReports.getAutomation.mockReset();
    mockedReports.updateAutomation.mockReset();
    mockedMetrics.list.mockReset();
    mockedRepetitiveTasks.list.mockReset();

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
    mockedReports.getAutomation.mockResolvedValue(buildAutomation());
    mockedReports.updateAutomation.mockImplementation(async (payload: ReportAutomation) => payload);
    mockedMetrics.list.mockResolvedValue([
      {
        id: 31,
        key: "deep_work_minutes",
        label: "Deep Work",
        unit: "minutes",
        type: "default",
        target: 120,
        active: true,
        created_at: "2026-07-07T08:00:00Z",
      },
    ]);
    mockedRepetitiveTasks.list.mockResolvedValue([
      {
        id: 71,
        name: "Morning Stretch",
        description: null,
        frequencies: ["daily"],
        priority: "medium",
        status: "active",
        linked_goal_ids: [],
        linked_metric_ids: [],
        created_at: "2026-07-07T08:00:00Z",
        updated_at: "2026-07-07T08:00:00Z",
      },
    ]);
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

  it("opens automation panel and saves updated config", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Automation" }));

    await waitFor(() => {
      expect(mockedReports.getAutomation).toHaveBeenCalledTimes(1);
      expect(mockedMetrics.list).toHaveBeenCalledTimes(1);
      expect(mockedRepetitiveTasks.list).toHaveBeenCalledTimes(1);
    });

    const dailyToggle = await screen.findByLabelText("Auto-generate Daily report");
    await user.click(dailyToggle);
    await user.click(screen.getByRole("button", { name: "Save automation" }));

    await waitFor(() => {
      expect(mockedReports.updateAutomation).toHaveBeenCalledTimes(1);
    });
    const payload = mockedReports.updateAutomation.mock.calls[0][0] as ReportAutomation;
    expect(payload.daily_enabled).toBe(false);
  });
});
