import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RepetitiveTask } from "@/api";
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
        create: vi.fn(),
        remove: vi.fn(),
        logs: vi.fn(),
        addLog: vi.fn(),
        progressCoachRecommendations: vi.fn(),
        acceptProgressCoachRecommendation: vi.fn(),
      },
      repetitiveTasks: {
        ...actual.api.repetitiveTasks,
        list: vi.fn(),
      },
    },
  };
});

const mockedMetricsApi = api.metrics as unknown as {
  list: Mock;
  create: Mock;
  remove: Mock;
  logs: Mock;
  addLog: Mock;
  progressCoachRecommendations: Mock;
  acceptProgressCoachRecommendation: Mock;
};

const mockedRepetitiveTasksApi = api.repetitiveTasks as unknown as {
  list: Mock;
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
    time_span: "day",
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

function buildHabit(overrides: Partial<RepetitiveTask> = {}): RepetitiveTask {
  return {
    id: 50,
    name: "Drink water",
    description: "Drink 2500ml water daily",
    frequencies: ["daily"],
    priority: "medium",
    status: "active",
    linked_goal_ids: [],
    linked_metric_ids: [],
    created_at: "2026-07-06T10:00:00.000Z",
    updated_at: "2026-07-06T10:00:00.000Z",
    ...overrides,
  };
}

describe("TrackPage", () => {
  beforeEach(() => {
    mockedMetricsApi.list.mockReset();
    mockedMetricsApi.create.mockReset();
    mockedMetricsApi.remove.mockReset();
    mockedMetricsApi.logs.mockReset();
    mockedMetricsApi.addLog.mockReset();
    mockedMetricsApi.progressCoachRecommendations.mockReset();
    mockedMetricsApi.acceptProgressCoachRecommendation.mockReset();
    mockedRepetitiveTasksApi.list.mockReset();

    mockedMetricsApi.list.mockResolvedValue([]);
    mockedMetricsApi.create.mockResolvedValue(buildMetric());
    mockedMetricsApi.logs.mockResolvedValue([]);
    mockedMetricsApi.progressCoachRecommendations.mockResolvedValue([]);
    mockedMetricsApi.acceptProgressCoachRecommendation.mockResolvedValue({
      recommendation_id: 100,
      habit_id: 50,
      metric: buildMetric(),
    });
    mockedRepetitiveTasksApi.list.mockResolvedValue([buildHabit()]);
  });

  it("renders progress coach recommendation cards", async () => {
    mockedMetricsApi.progressCoachRecommendations.mockResolvedValue([
      buildRecommendation({ metric_name: "Water intake", target: 2500, unit_hint: "ml" }),
    ]);

    renderPage();

    expect(await screen.findByText("Progress Coach recommendations")).toBeInTheDocument();
    expect(await screen.findByText("Water intake")).toBeInTheDocument();
    expect(screen.getByText("Drink water")).toBeInTheDocument();
    expect(screen.getByText("Target: 2500ml/d")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add this" })).toBeInTheDocument();
  });

  it("renders weekly and monthly target suffixes", async () => {
    mockedMetricsApi.progressCoachRecommendations.mockResolvedValue([
      buildRecommendation({
        id: 201,
        metric_name: "Run minutes",
        unit: "minutes",
        target: 180,
        unit_hint: null,
        time_span: "week",
        rationale: "Track weekly running volume.",
      }),
      buildRecommendation({
        id: 202,
        metric_name: "Books finished",
        unit: "count",
        target: 2,
        unit_hint: null,
        time_span: "month",
        rationale: "Track monthly reading output.",
      }),
    ]);

    renderPage();

    expect(await screen.findByText("Target: 3h/w")).toBeInTheDocument();
    expect(screen.getByText("Target: 2/m")).toBeInTheDocument();
  });

  it("opens prefilled modal from recommendation and creates metric after edit", async () => {
    const user = userEvent.setup();
    mockedMetricsApi.progressCoachRecommendations.mockResolvedValue([buildRecommendation()]);
    mockedMetricsApi.create.mockResolvedValue(
      buildMetric({
        id: 99,
        key: "habit_50_water_intake_ml",
        label: "Hydration tracker",
        unit: "custom",
        unit_text: "ml",
        target: 2500,
        linked_habit_ids: [50],
      }),
    );

    renderPage();

    const addButton = await screen.findByRole("button", { name: "Add this" });
    await user.click(addButton);

    const nameInput = await screen.findByLabelText("Name");
    expect(nameInput).toHaveValue("Water intake");
    expect(screen.queryByLabelText("Key")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Unit")).toHaveValue("ml");
    expect(screen.getByLabelText(/target \(optional\)/i)).toHaveValue(2500);

    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Hydration tracker");

    await user.click(screen.getByRole("button", { name: "Create metric" }));

    expect(mockedMetricsApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "habit_50_water_intake_ml",
        label: "Hydration tracker",
        unit_text: "ml",
        time_span: "day",
        time_span_custom_text: null,
        target: 2500,
        linked_habit_ids: [50],
      }),
    );

    expect(mockedMetricsApi.acceptProgressCoachRecommendation).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.queryByText("Hydration is quantifiable daily.")).not.toBeInTheDocument();
    });

    expect(await screen.findByText("Hydration tracker")).toBeInTheDocument();
  });

  it("shows empty recommendation state when none are pending", async () => {
    mockedMetricsApi.progressCoachRecommendations.mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText("No pending recommendations")).toBeInTheDocument();
  });
});
