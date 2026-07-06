import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { api, type ProgressCoachRecommendation, type TrackedMetric } from "@/api";
import { ToastProvider } from "@/context/ToastContext";

import { TrackPage } from "./TrackPage";

vi.mock("@/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      metrics: {
        ...actual.api.metrics,
        list: vi.fn(),
        remove: vi.fn(),
        logs: vi.fn(),
        addLog: vi.fn(),
        progressCoachRecommendations: vi.fn(),
        acceptProgressCoachRecommendation: vi.fn(),
      },
    },
  };
});

const mockedMetricsApi = api.metrics as unknown as {
  list: Mock;
  remove: Mock;
  logs: Mock;
  addLog: Mock;
  progressCoachRecommendations: Mock;
  acceptProgressCoachRecommendation: Mock;
};

function buildMetric(overrides: Partial<TrackedMetric> = {}): TrackedMetric {
  return {
    id: 1,
    key: "leetcode_solved",
    label: "LeetCode solved",
    unit: "count",
    type: "custom",
    target: 10,
    active: true,
    created_at: "2026-07-06T10:00:00.000Z",
    ...overrides,
  };
}

function buildRecommendation(
  overrides: Partial<ProgressCoachRecommendation> = {},
): ProgressCoachRecommendation {
  return {
    id: 100,
    habit_id: 50,
    habit_name: "Drink water",
    metric_name: "Water intake",
    metric_key: "habit_50_water_intake_ml",
    unit: "custom",
    target: 2500,
    unit_hint: "ml",
    rationale: "Hydration is quantifiable daily.",
    created_at: "2026-07-06T10:00:00.000Z",
    ...overrides,
  };
}

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <TrackPage />
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe("TrackPage", () => {
  beforeEach(() => {
    mockedMetricsApi.list.mockReset();
    mockedMetricsApi.remove.mockReset();
    mockedMetricsApi.logs.mockReset();
    mockedMetricsApi.addLog.mockReset();
    mockedMetricsApi.progressCoachRecommendations.mockReset();
    mockedMetricsApi.acceptProgressCoachRecommendation.mockReset();

    mockedMetricsApi.list.mockResolvedValue([]);
    mockedMetricsApi.logs.mockResolvedValue([]);
    mockedMetricsApi.progressCoachRecommendations.mockResolvedValue([]);
    mockedMetricsApi.acceptProgressCoachRecommendation.mockResolvedValue({
      recommendation_id: 100,
      habit_id: 50,
      metric: buildMetric(),
    });
  });

  it("renders progress coach recommendation cards", async () => {
    mockedMetricsApi.progressCoachRecommendations.mockResolvedValue([
      buildRecommendation({ metric_name: "Water intake", target: 2500, unit_hint: "ml" }),
    ]);

    renderPage();

    expect(await screen.findByText("Progress Coach recommendations")).toBeInTheDocument();
    expect(await screen.findByText("Water intake")).toBeInTheDocument();
    expect(screen.getByText("Drink water")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add this" })).toBeInTheDocument();
  });

  it("accepts recommendation and appends the created metric", async () => {
    const user = userEvent.setup();
    mockedMetricsApi.progressCoachRecommendations.mockResolvedValue([buildRecommendation()]);
    mockedMetricsApi.acceptProgressCoachRecommendation.mockResolvedValue({
      recommendation_id: 100,
      habit_id: 50,
      metric: buildMetric({
        id: 99,
        key: "habit_50_water_intake_ml",
        label: "Water intake",
        unit: "custom",
        target: 2500,
      }),
    });

    renderPage();

    const addButton = await screen.findByRole("button", { name: "Add this" });
    await user.click(addButton);

    expect(mockedMetricsApi.acceptProgressCoachRecommendation).toHaveBeenCalledWith(100);

    await waitFor(() => {
      expect(screen.queryByText("Hydration is quantifiable daily.")).not.toBeInTheDocument();
    });

    expect(await screen.findByText("Water intake")).toBeInTheDocument();
  });

  it("shows empty recommendation state when none are pending", async () => {
    mockedMetricsApi.progressCoachRecommendations.mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText("No pending recommendations")).toBeInTheDocument();
  });
});
