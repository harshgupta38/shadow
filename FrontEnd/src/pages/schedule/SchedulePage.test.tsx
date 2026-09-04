import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { api } from "@/api";
import { ToastProvider } from "@/context/ToastContext";

import { SchedulePage } from "./SchedulePage";

vi.mock("@/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      plan: {
        ...actual.api.plan,
        list: vi.fn(),
        remove: vi.fn(),
      },
      goals: {
        ...actual.api.goals,
        list: vi.fn(),
      },
      repetitiveTasks: {
        ...actual.api.repetitiveTasks,
        list: vi.fn(),
      },
    },
  };
});

const mockedPlanApi = api.plan as unknown as {
  list: Mock;
  remove: Mock;
};

const mockedGoalsApi = api.goals as unknown as {
  list: Mock;
};

const mockedRepetitiveApi = api.repetitiveTasks as unknown as {
  list: Mock;
};

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <SchedulePage />
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe("SchedulePage", () => {
  beforeEach(() => {
    mockedPlanApi.list.mockReset();
    mockedPlanApi.remove.mockReset();
    mockedGoalsApi.list.mockReset();
    mockedRepetitiveApi.list.mockReset();

    mockedGoalsApi.list.mockResolvedValue([{ id: 9, title: "Networking goal" }]);
    mockedRepetitiveApi.list.mockResolvedValue([
      {
        id: 7,
        name: "Weekly networking",
        description: "Reach out",
        frequencies: ["weekly"],
        priority: "medium",
        status: "active",
        linked_goal_ids: [9],
        linked_metric_ids: [],
        created_at: "2026-07-07T09:00:00.000Z",
        updated_at: "2026-07-07T09:00:00.000Z",
      },
    ]);
    mockedPlanApi.list.mockResolvedValue([
      {
        id: 100,
        title: "Ship profile patch",
        description: "",
        date: "2000-01-01",
        reminder_time: null,
        estimated_duration_minutes: null,
        status: "planned",
        source: "manual",
        priority: "medium",
        ai_rationale: null,
        ai_impact_if_skipped: null,
        ai_confidence_score: null,
        suggested_start_time: null,
        suggested_finish_by_time: null,
        execution_order: null,
        carried_from_date: null,
        generated_at: null,
        related_goal_id: null,
        linked_habit_id: null,
        completed_at: null,
        created_at: "2026-07-07T09:00:00.000Z",
      },
      {
        id: 101,
        title: "Meet senior engineer",
        description: "<p>Prepare discussion points.</p>",
        date: "2099-01-01",
        reminder_time: null,
        estimated_duration_minutes: null,
        status: "planned",
        source: "manual",
        priority: "high",
        ai_rationale: null,
        ai_impact_if_skipped: null,
        ai_confidence_score: null,
        suggested_start_time: null,
        suggested_finish_by_time: null,
        execution_order: null,
        carried_from_date: null,
        generated_at: null,
        related_goal_id: 9,
        linked_habit_id: 7,
        completed_at: null,
        created_at: "2026-07-07T09:00:00.000Z",
      },
      {
        id: 102,
        title: "Completed retrospective",
        description: "",
        date: "2000-01-02",
        reminder_time: null,
        estimated_duration_minutes: null,
        status: "done",
        source: "manual",
        priority: "low",
        ai_rationale: null,
        ai_impact_if_skipped: null,
        ai_confidence_score: null,
        suggested_start_time: null,
        suggested_finish_by_time: null,
        execution_order: null,
        carried_from_date: null,
        generated_at: null,
        related_goal_id: null,
        linked_habit_id: null,
        completed_at: "2026-07-07T09:00:00.000Z",
        created_at: "2026-07-07T09:00:00.000Z",
      },
      {
        id: 103,
        title: "AI-generated finished task",
        description: "",
        date: "2000-01-03",
        reminder_time: null,
        estimated_duration_minutes: null,
        status: "done",
        source: "ai_generated",
        priority: "low",
        ai_rationale: null,
        ai_impact_if_skipped: null,
        ai_confidence_score: null,
        suggested_start_time: null,
        suggested_finish_by_time: null,
        execution_order: null,
        carried_from_date: null,
        generated_at: null,
        related_goal_id: null,
        linked_habit_id: null,
        completed_at: "2026-07-07T09:00:00.000Z",
        created_at: "2026-07-07T09:00:00.000Z",
      },
      {
        id: 104,
        title: "AI-generated due task",
        description: "",
        date: "2000-01-04",
        reminder_time: null,
        estimated_duration_minutes: null,
        status: "planned",
        source: "ai_generated",
        priority: "medium",
        ai_rationale: null,
        ai_impact_if_skipped: null,
        ai_confidence_score: null,
        suggested_start_time: null,
        suggested_finish_by_time: null,
        execution_order: null,
        carried_from_date: null,
        generated_at: null,
        related_goal_id: null,
        linked_habit_id: null,
        completed_at: null,
        created_at: "2026-07-07T09:00:00.000Z",
      },
      {
        id: 105,
        title: "AI-generated future task",
        description: "",
        date: "2099-01-02",
        reminder_time: null,
        estimated_duration_minutes: null,
        status: "planned",
        source: "ai_generated",
        priority: "medium",
        ai_rationale: null,
        ai_impact_if_skipped: null,
        ai_confidence_score: null,
        suggested_start_time: null,
        suggested_finish_by_time: null,
        execution_order: null,
        carried_from_date: null,
        generated_at: null,
        related_goal_id: null,
        linked_habit_id: null,
        completed_at: null,
        created_at: "2026-07-07T09:00:00.000Z",
      },
    ]);
  });

  it("shows scheduled tasks by default", async () => {
    renderPage();

    expect(await screen.findByText("Meet senior engineer")).toBeInTheDocument();
    expect(screen.getByText("Habit: Weekly networking")).toBeInTheDocument();
    expect(screen.getByText("Goal: Networking goal")).toBeInTheDocument();
    expect(screen.queryByText("AI-generated future task")).not.toBeInTheDocument();
    expect(screen.queryByText("Ship profile patch")).not.toBeInTheDocument();
    expect(screen.queryByText("Completed retrospective")).not.toBeInTheDocument();
  });

  it("switches between Due and Done filters", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Meet senior engineer");

    await user.click(screen.getByRole("tab", { name: "Due 1" }));
    expect(await screen.findByText("Ship profile patch")).toBeInTheDocument();
    expect(screen.queryByText("AI-generated due task")).not.toBeInTheDocument();
    expect(screen.queryByText("Meet senior engineer")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Done 1" }));
    expect(await screen.findByText("Completed retrospective")).toBeInTheDocument();
    expect(screen.queryByText("AI-generated finished task")).not.toBeInTheDocument();
    expect(screen.queryByText("Ship profile patch")).not.toBeInTheDocument();
  });
});
