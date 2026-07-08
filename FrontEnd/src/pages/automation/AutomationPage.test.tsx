import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { api, type ReportAutomation } from "@/api";
import { ToastProvider } from "@/context/ToastContext";

import { AutomationPage } from "./AutomationPage";

vi.mock("@/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      reports: {
        ...actual.api.reports,
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

function renderPage(path = "/automation") {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/automation" element={<AutomationPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe("AutomationPage", () => {
  beforeEach(() => {
    mockedReports.getAutomation.mockReset();
    mockedReports.updateAutomation.mockReset();
    mockedMetrics.list.mockReset();
    mockedRepetitiveTasks.list.mockReset();

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

  it("loads automation controls", async () => {
    renderPage();

    expect(await screen.findByText("Automation")).toBeInTheDocument();
    expect(await screen.findByLabelText("Auto-generate Daily report")).toBeInTheDocument();

    await waitFor(() => {
      expect(mockedReports.getAutomation).toHaveBeenCalledTimes(1);
      expect(mockedMetrics.list).toHaveBeenCalledTimes(1);
      expect(mockedRepetitiveTasks.list).toHaveBeenCalledTimes(1);
    });
  });

  it("saves updated automation config", async () => {
    const user = userEvent.setup();
    renderPage();

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
