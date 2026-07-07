import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { api, type PlannedTask } from "@/api";
import { ToastProvider } from "@/context/ToastContext";
import { toISODate } from "@/lib/format";

import { ScheduleTaskModal } from "./ScheduleTaskModal";

vi.mock("react-quill", () => ({
  default: ({ value, onChange, readOnly, placeholder }: any) => (
    <textarea
      aria-label="Description"
      data-testid="schedule-description-editor"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      readOnly={readOnly}
      placeholder={placeholder}
    />
  ),
}));

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
      repetitiveTasks: {
        ...actual.api.repetitiveTasks,
        list: vi.fn(),
      },
      plan: {
        ...actual.api.plan,
        draftScheduleTask: vi.fn(),
        createScheduled: vi.fn(),
        updateScheduled: vi.fn(),
      },
    },
  };
});

const mockedGoalsApi = api.goals as unknown as {
  list: Mock;
};

const mockedRepetitiveApi = api.repetitiveTasks as unknown as {
  list: Mock;
};

const mockedPlanApi = api.plan as unknown as {
  draftScheduleTask: Mock;
  createScheduled: Mock;
  updateScheduled: Mock;
};

function buildTask(overrides: Record<string, unknown> = {}): PlannedTask {
  return {
    id: 4,
    title: "Meet senior engineer",
    description: "<p>Prepare notes.</p>",
    date: toISODate(),
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
    ...overrides,
  };
}

type ScheduleTaskModalProps = Parameters<typeof ScheduleTaskModal>[0];

function renderModal(props?: Partial<ScheduleTaskModalProps>) {
  const onClose = props?.onClose ?? vi.fn();
  const onSaved = props?.onSaved ?? vi.fn();

  render(
    <ToastProvider>
      <ScheduleTaskModal
        show
        onClose={onClose}
        onSaved={onSaved}
        {...props}
      />
    </ToastProvider>,
  );

  return { onClose, onSaved };
}

describe("ScheduleTaskModal", () => {
  beforeEach(() => {
    mockedGoalsApi.list.mockReset();
    mockedRepetitiveApi.list.mockReset();
    mockedPlanApi.draftScheduleTask.mockReset();
    mockedPlanApi.createScheduled.mockReset();
    mockedPlanApi.updateScheduled.mockReset();

    mockedGoalsApi.list.mockResolvedValue([{ id: 9, title: "Networking goal" }]);
    mockedRepetitiveApi.list.mockResolvedValue([
      {
        id: 7,
        name: "Weekly networking",
        description: "Reach out to peers",
        frequencies: ["weekly"],
        priority: "medium",
        status: "active",
        linked_goal_ids: [9],
        linked_metric_ids: [],
        created_at: "2026-07-07T09:00:00.000Z",
        updated_at: "2026-07-07T09:00:00.000Z",
      },
    ]);
  });

  it("starts in automatic mode with locked fields until refine or manual mode", async () => {
    const user = userEvent.setup();

    renderModal();

    expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Tell Shadow what you want to plan")).toHaveClass(
      "schedule-shadow-prompt-input",
    );

    await user.click(screen.getByRole("button", { name: "Manual" }));

    expect(screen.getByLabelText("Title")).toBeEnabled();
    expect(screen.getByLabelText("Date")).toBeEnabled();
  });

  it("hides manual fields again when switching back to automatic", async () => {
    const user = userEvent.setup();

    renderModal();

    await user.click(screen.getByRole("button", { name: "Manual" }));
    expect(screen.getByLabelText("Title")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Automatic" }));
    expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
  });

  it("allows canceling while automatic mode is still locked", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    expect(cancelButton).toBeEnabled();
    await user.click(cancelButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("blocks past-date scheduling from the form", async () => {
    const user = userEvent.setup();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    renderModal();

    await user.click(screen.getByRole("button", { name: "Manual" }));
    await user.type(screen.getByLabelText("Title"), "Backfill something");
    const dateInput = screen.getByLabelText("Date") as HTMLInputElement;
    expect(dateInput.min).toBe(toISODate());
    await user.clear(dateInput);
    await user.type(dateInput, yesterday);
    await user.click(screen.getByRole("button", { name: "Save task" }));

    expect(mockedPlanApi.createScheduled).not.toHaveBeenCalled();
  });

  it("refines prompt and submits mapped create payload", async () => {
    const user = userEvent.setup();
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    mockedPlanApi.draftScheduleTask.mockResolvedValue({
      title: "Meet Animesh",
      description: "Discuss sprint priorities.",
      date: tomorrow,
      priority: "high",
      linked_habit_id: 7,
      related_goal_id: 9,
    });

    mockedPlanApi.createScheduled.mockResolvedValue(
      buildTask({
        id: 11,
        title: "Meet Animesh",
        description: "<p>Discuss sprint priorities.</p>",
        date: tomorrow,
      }),
    );

    const { onClose, onSaved } = renderModal();

    await user.type(screen.getByLabelText("Tell Shadow what you want to plan"), "Meet Animesh tomorrow");
    await user.click(screen.getByRole("button", { name: "Refine" }));

    await waitFor(() => {
      expect(mockedPlanApi.draftScheduleTask).toHaveBeenCalledWith({
        prompt: "Meet Animesh tomorrow",
        on_date: toISODate(),
      });
    });

    expect((await screen.findByLabelText("Title") as HTMLInputElement).value).toBe("Meet Animesh");

    await user.click(screen.getByRole("button", { name: "Save task" }));

    await waitFor(() => {
      expect(mockedPlanApi.createScheduled).toHaveBeenCalledWith({
        title: "Meet Animesh",
        description: "<p>Discuss sprint priorities.</p>",
        date: tomorrow,
        priority: "high",
        source: "manual",
        linked_habit_id: 7,
        related_goal_id: 9,
      });
    });

    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 11 }), true);
    expect(onClose).toHaveBeenCalled();
  });

  it("updates existing scheduled tasks in edit mode", async () => {
    const user = userEvent.setup();

    mockedPlanApi.updateScheduled.mockResolvedValue(
      buildTask({
        title: "Meet senior engineer (updated)",
      }),
    );

    const existing = buildTask();
    renderModal({ task: existing });

    const titleInput = await screen.findByLabelText("Title");
    await user.clear(titleInput);
    await user.type(titleInput, "Meet senior engineer (updated)");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(mockedPlanApi.updateScheduled).toHaveBeenCalledWith(existing.id, {
        title: "Meet senior engineer (updated)",
        description: "<p>Prepare notes.</p>",
        date: toISODate(),
        priority: "high",
        source: "manual",
        linked_habit_id: 7,
        related_goal_id: 9,
      });
    });
  });
});
