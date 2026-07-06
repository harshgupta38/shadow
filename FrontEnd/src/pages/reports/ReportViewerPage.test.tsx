import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { api, type Report } from "@/api";
import { ToastProvider } from "@/context/ToastContext";

import { ReportViewerPage } from "./ReportViewerPage";

vi.mock("@/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      reports: {
        ...actual.api.reports,
        versions: vi.fn(),
        remove: vi.fn(),
      },
    },
  };
});

const mockedReports = api.reports as unknown as {
  versions: Mock;
  remove: Mock;
};

function buildReport(id: number, options: Partial<Report> = {}): Report {
  return {
    id,
    period: "daily",
    source: "manual",
    period_start: "2026-07-07T00:00:00Z",
    period_end: "2026-07-07T23:59:59Z",
    metrics_json: {
      tasks: { planned: 5, completed: 4 },
      metrics: [],
    },
    narrative: "# Reflection\n\nThis is a narrative.",
    next_steps: "- Ship the next task",
    created_at: "2026-07-07T18:00:00Z",
    ...options,
  };
}

function renderPage(path = "/reports/day/2026-07-07?period=daily&reportId=2") {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/reports" element={<div>Reports home</div>} />
          <Route path="/reports/day/:historyDate" element={<ReportViewerPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe("ReportViewerPage", () => {
  beforeEach(() => {
    mockedReports.versions.mockReset();
    mockedReports.remove.mockReset();

    mockedReports.versions.mockResolvedValue([
      buildReport(1, {
        created_at: "2026-07-07T08:15:00Z",
      }),
      buildReport(2, {
        created_at: "2026-07-07T16:20:00Z",
        source: "automatic",
      }),
    ]);

    mockedReports.remove.mockResolvedValue(undefined);
  });

  it("navigates between versions while staying on the viewer", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("Version 2 of 2")).toBeInTheDocument();
    expect(screen.getByText("Automatically generated")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Previous" }));

    expect(await screen.findByText("Version 1 of 2")).toBeInTheDocument();
    expect(screen.getByText("Manually generated")).toBeInTheDocument();
  });

  it("deletes the selected version and redirects when it was the last one", async () => {
    mockedReports.versions.mockResolvedValueOnce([buildReport(2)]);

    const user = userEvent.setup();
    renderPage("/reports/day/2026-07-07?reportId=2");

    await user.click(await screen.findByRole("button", { name: /delete/i }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(mockedReports.remove).toHaveBeenCalledWith(2);
    });
    expect(await screen.findByText("Reports home")).toBeInTheDocument();
  });
});
