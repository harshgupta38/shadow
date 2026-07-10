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
      plan: {
        ...actual.api.plan,
        list: vi.fn(),
      },
    },
  };
});

const mockedReports = api.reports as unknown as {
  history: Mock;
  generate: Mock;
};
const mockedPlan = api.plan as unknown as {
  list: Mock;
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
    mockedPlan.list.mockReset();
    mockedPlan.list.mockResolvedValue([
      {
        id: 1,
        title: "Task",
        date: "2026-07-07",
        status: "planned",
        source: "manual",
        priority: "medium",
        estimated_duration_minutes: null,
        suggested_start_time: null,
        suggested_finish_by_time: null,
        execution_order: null,
        related_goal_id: null,
        linked_habit_id: null,
        ai_rationale: null,
        ai_impact_if_skipped: null,
        ai_confidence_score: null,
        carried_from_date: null,
        generated_at: null,
        completed_at: null,
        created_at: "2026-07-07T00:00:00Z",
        updated_at: "2026-07-07T00:00:00Z",
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

  it("generates custom-date daily report when tasks exist", async () => {
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
          history_date: "2026-07-09",
          versions_count: 1,
          latest_report_id: 21,
          latest_period: "daily",
          latest_created_at: "2026-07-09T20:00:00Z",
          latest_narrative_snippet: "Custom summary",
          report_periods: ["daily"],
        },
      ]);
    mockedReports.generate.mockResolvedValueOnce(buildReport(21, "daily"));

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Custom Date" }));
    const input = await screen.findByLabelText("Select date (no future date)");
    await user.type(input, "2026-07-09");

    await user.click(screen.getByRole("button", { name: "Generate" }));

    await waitFor(() => {
      expect(mockedPlan.list).toHaveBeenCalledWith("2026-07-09");
      expect(mockedReports.generate).toHaveBeenCalledWith({
        period: "daily",
        on_date: "2026-07-09",
      });
    });
  });

  it("blocks custom-date report generation and shows toast when no tasks exist", async () => {
    mockedPlan.list.mockResolvedValueOnce([]);

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Custom Date" }));
    const input = await screen.findByLabelText("Select date (no future date)");
    await user.type(input, "2026-07-09");

    await user.click(screen.getByRole("button", { name: "Generate" }));

    await waitFor(() => {
      expect(mockedPlan.list).toHaveBeenCalledWith("2026-07-09");
      expect(mockedReports.generate).not.toHaveBeenCalled();
    });
    expect(
      await screen.findByText("No tasks found for the selected date. Please choose another date."),
    ).toBeInTheDocument();
  });

});
