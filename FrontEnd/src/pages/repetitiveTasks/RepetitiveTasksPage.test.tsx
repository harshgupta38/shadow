import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { api, type RepetitiveTask, type RepetitiveTaskRecommendation } from "@/api";
import { ToastProvider } from "@/context/ToastContext";

import { RepetitiveTasksPage } from "./RepetitiveTasksPage";

vi.mock("@/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      goals: {
        ...actual.api.goals,
        list: vi.fn(),
      },
      metrics: {
        ...actual.api.metrics,
        list: vi.fn(),
      },
      repetitiveTasks: {
        ...actual.api.repetitiveTasks,
        list: vi.fn(),
        recommendations: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
      },
    },
  };
});

const mockedGoalsApi = api.goals as unknown as { list: Mock };
const mockedMetricsApi = api.metrics as unknown as { list: Mock };
const mockedRepetitiveTasksApi = api.repetitiveTasks as unknown as {
  list: Mock;
  recommendations: Mock;
  create: Mock;
  update: Mock;
  remove: Mock;
};

function buildTask(overrides: Partial<RepetitiveTask> = {}): RepetitiveTask {
  return {
    id: 1,
    name: "Workout routine",
    description: "Stay consistent",
    frequencies: ["daily"],
    priority: "high",
    status: "active",
    linked_goal_ids: [],
    linked_metric_ids: [],
    created_at: "2026-07-04T09:00:00.000Z",
    updated_at: "2026-07-04T09:00:00.000Z",
    ...overrides,
  };
}

function buildRecommendation(
  overrides: Partial<RepetitiveTaskRecommendation> = {},
): RepetitiveTaskRecommendation {
  return {
    name: "Workout routine",
    description: "Build consistency and energy with focused movement sessions.",
    frequencies: ["monday", "wednesday", "friday"],
    priority: "high",
    rationale: "Consistent movement improves long-term energy and follow-through.",
    linked_goal_ids: [],
    linked_metric_ids: [],
    ...overrides,
  };
}

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <RepetitiveTasksPage />
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe("RepetitiveTasksPage", () => {
  beforeEach(() => {
    mockedGoalsApi.list.mockReset();
    mockedMetricsApi.list.mockReset();
    mockedRepetitiveTasksApi.list.mockReset();
    mockedRepetitiveTasksApi.recommendations.mockReset();
    mockedRepetitiveTasksApi.create.mockReset();
    mockedRepetitiveTasksApi.update.mockReset();
    mockedRepetitiveTasksApi.remove.mockReset();

    mockedGoalsApi.list.mockResolvedValue([]);
    mockedMetricsApi.list.mockResolvedValue([]);
    mockedRepetitiveTasksApi.list.mockResolvedValue([]);
    mockedRepetitiveTasksApi.recommendations.mockResolvedValue([buildRecommendation()]);
    mockedRepetitiveTasksApi.create.mockResolvedValue(buildTask({ id: 999 }));
    mockedRepetitiveTasksApi.update.mockResolvedValue(buildTask({ id: 1 }));
    mockedRepetitiveTasksApi.remove.mockResolvedValue(undefined);
  });

  it("loads repetitive tasks from the API", async () => {
    mockedRepetitiveTasksApi.list.mockResolvedValue([
      buildTask({
        id: 42,
        name: "Workout routine",
      }),
    ]);

    renderPage();

    expect(await screen.findByTestId("repetitive-task-42")).toBeInTheDocument();
  });

  it("filters tasks by status and priority from header pills", async () => {
    const user = userEvent.setup();
    mockedRepetitiveTasksApi.list.mockResolvedValue([
      buildTask({
        id: 1,
        name: "Active Medium Task",
        status: "active",
        priority: "medium",
      }),
      buildTask({
        id: 2,
        name: "Paused Critical Task",
        status: "paused",
        priority: "critical",
      }),
    ]);

    renderPage();

    expect(await screen.findByTestId("repetitive-task-1")).toBeInTheDocument();
    expect(screen.getByTestId("repetitive-task-2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /status filter/i }));
    await user.click(screen.getByRole("button", { name: "Paused" }));

    expect(screen.queryByTestId("repetitive-task-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("repetitive-task-2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /status filter/i }));
    await user.click(screen.getByRole("button", { name: "Status" }));

    expect(screen.getByTestId("repetitive-task-1")).toBeInTheDocument();
    expect(screen.getByTestId("repetitive-task-2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /priority filter/i }));
    await user.click(screen.getByRole("button", { name: "Critical" }));

    expect(screen.queryByTestId("repetitive-task-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("repetitive-task-2")).toBeInTheDocument();
  });

  it("creates a repetitive task using the API", async () => {
    const user = userEvent.setup();
    mockedRepetitiveTasksApi.create.mockResolvedValue(
      buildTask({
        id: 2,
        name: "Meditation",
        frequencies: ["daily"],
        priority: "medium",
      }),
    );

    renderPage();

    await user.type(screen.getByLabelText(/task name/i), "Meditation");
    await user.click(screen.getByRole("button", { name: "Daily" }));
    await user.click(screen.getByRole("button", { name: /create repetitive task/i }));

    expect(mockedRepetitiveTasksApi.create).toHaveBeenCalledWith({
      name: "Meditation",
      description: null,
      frequencies: ["daily"],
      priority: "medium",
      linked_goal_ids: [],
      linked_metric_ids: [],
    });
    expect(await screen.findByText("Meditation")).toBeInTheDocument();
  });

  it("clears the create form without submitting", async () => {
    const user = userEvent.setup();

    renderPage();

    await user.type(screen.getByLabelText(/task name/i), "Meditation");
    await user.click(screen.getByRole("button", { name: "Daily" }));
    await user.selectOptions(screen.getByRole("combobox", { name: /^Priority$/i }), "high");
    await user.type(screen.getByLabelText(/description/i), "Stay focused every day");

    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect((screen.getByLabelText(/task name/i) as HTMLInputElement).value).toBe("");
    expect((screen.getByRole("combobox", { name: /^Priority$/i }) as HTMLSelectElement).value).toBe("medium");
    expect((screen.getByLabelText(/description/i) as HTMLTextAreaElement).value).toBe("");
    expect(mockedRepetitiveTasksApi.create).not.toHaveBeenCalled();
  });

  it("does not submit the edit form when opening goals dropdown", async () => {
    const user = userEvent.setup();
    const scrollToSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    mockedGoalsApi.list.mockResolvedValue([
      {
        id: 11,
        title: "Secure SDE 1 role at MAANG",
      },
    ]);
    mockedRepetitiveTasksApi.list.mockResolvedValue([
      buildTask({
        id: 1,
        name: "Wakeup Early",
        description: "Wakeup by 8am daily and work towards your goals",
        priority: "medium",
      }),
    ]);

    renderPage();

    const card = await screen.findByTestId("repetitive-task-1");
    await user.click(within(card).getByRole("button", { name: /open actions for wakeup early/i }));
    await user.click(screen.getByRole("button", { name: /edit wakeup early/i }));
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });

    const taskNameInput = screen.getByLabelText(/task name/i) as HTMLInputElement;
    expect(taskNameInput.value).toBe("Wakeup Early");

    await user.click(screen.getByRole("button", { name: "Link goals (optional)" }));

    expect(mockedRepetitiveTasksApi.update).not.toHaveBeenCalled();
    expect(taskNameInput.value).toBe("Wakeup Early");
    expect(screen.getByText("Secure SDE 1 role at MAANG")).toBeInTheDocument();
    scrollToSpy.mockRestore();
  });

  it("supports pause, resume, and archive lifecycle actions", async () => {
    const user = userEvent.setup();
    mockedRepetitiveTasksApi.list.mockResolvedValue([buildTask({ id: 1 })]);
    mockedRepetitiveTasksApi.update
      .mockResolvedValueOnce(buildTask({ id: 1, status: "paused" }))
      .mockResolvedValueOnce(buildTask({ id: 1, status: "active" }))
      .mockResolvedValueOnce(buildTask({ id: 1, status: "archived" }));

    renderPage();

    const card = await screen.findByTestId("repetitive-task-1");
    expect(within(card).getByText("Active")).toBeInTheDocument();

    await user.click(
      within(card).getByRole("button", { name: /open actions for workout routine/i }),
    );
    await user.click(screen.getByRole("button", { name: /pause workout routine/i }));
    expect(within(card).getByText("Paused")).toBeInTheDocument();

    await user.click(
      within(card).getByRole("button", { name: /open actions for workout routine/i }),
    );
    await user.click(screen.getByRole("button", { name: /resume workout routine/i }));
    expect(within(card).getByText("Active")).toBeInTheDocument();

    await user.click(
      within(card).getByRole("button", { name: /open actions for workout routine/i }),
    );
    await user.click(screen.getByRole("button", { name: /archive workout routine/i }));
    expect(within(card).getByText("Archived")).toBeInTheDocument();

    expect(mockedRepetitiveTasksApi.update).toHaveBeenCalledTimes(3);
  });

  it("deletes a task after confirmation", async () => {
    const user = userEvent.setup();
    mockedRepetitiveTasksApi.list.mockResolvedValue([buildTask({ id: 1 })]);

    renderPage();

    const card = await screen.findByTestId("repetitive-task-1");
    await user.click(
      within(card).getByRole("button", { name: /open actions for workout routine/i }),
    );
    await user.click(screen.getByRole("button", { name: /delete workout routine/i }));

    expect(await screen.findByText(/delete this repetitive task/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(mockedRepetitiveTasksApi.remove).toHaveBeenCalledWith(1);
    expect(screen.queryByTestId("repetitive-task-1")).not.toBeInTheDocument();
  });

  it("adds a recommendation immediately via API", async () => {
    const user = userEvent.setup();
    mockedRepetitiveTasksApi.recommendations.mockResolvedValue([
      buildRecommendation({ name: "Workout routine" }),
    ]);
    mockedRepetitiveTasksApi.create.mockResolvedValue(
      buildTask({
        id: 10,
        name: "Workout routine",
        frequencies: ["monday", "wednesday", "friday"],
      }),
    );

    renderPage();

    expect(screen.queryAllByTestId(/^repetitive-task-/)).toHaveLength(0);

    const addNowButtons = await screen.findAllByRole("button", { name: "Add now" });
    await user.click(addNowButtons[0]);

    expect(mockedRepetitiveTasksApi.create).toHaveBeenCalledWith({
      name: "Workout routine",
      description: "Build consistency and energy with focused movement sessions.",
      frequencies: ["monday", "wednesday", "friday"],
      priority: "high",
      linked_goal_ids: [],
      linked_metric_ids: [],
    });
    expect(screen.getAllByTestId(/^repetitive-task-/).length).toBe(1);
  });
});
