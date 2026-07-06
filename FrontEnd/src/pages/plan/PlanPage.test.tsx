import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { api } from "@/api";
import { ToastProvider } from "@/context/ToastContext";
import { toISODate } from "@/lib/format";

import { PlanPage } from "./PlanPage";

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
			plan: {
				...actual.api.plan,
				workspace: vi.fn(),
				generateToday: vi.fn(),
				create: vi.fn(),
				update: vi.fn(),
				logProgress: vi.fn(),
				remove: vi.fn(),
			},
		},
	};
});

const mockedGoalsApi = api.goals as unknown as {
	list: Mock;
};

const mockedPlanApi = api.plan as unknown as {
	workspace: Mock;
	generateToday: Mock;
	create: Mock;
	update: Mock;
	logProgress: Mock;
	remove: Mock;
};

function buildTask(overrides: Record<string, unknown> = {}) {
	return {
		id: 1,
		title: "Deep work block",
		date: toISODate(),
		reminder_time: "08:00",
		estimated_duration_minutes: 60,
		status: "planned",
		source: "manual",
		priority: "high",
		ai_rationale: "High-impact planning slot.",
		ai_impact_if_skipped: "Skipping this can delay your key goal.",
		ai_confidence_score: 88,
		suggested_start_time: "09:00",
		suggested_finish_by_time: "10:00",
		execution_order: 1,
		carried_from_date: null,
		generated_at: null,
		related_goal_id: null,
		category: "Career",
		goal_title: "Ship MVP",
		missed_yesterday: true,
		overdue: false,
		completed_late: false,
		current_habit_streak: 3,
		previous_completion_history: "Completed 4/5 previous occurrences.",
		completed_at: null,
		created_at: "2026-07-04T09:00:00.000Z",
		...overrides,
	};
}

function buildWorkspace(overrides: Record<string, unknown> = {}) {
	const tasks = [buildTask()];
	return {
		date: toISODate(),
		tasks,
		insights: {
			missed_yesterday_count: 2,
			missed_yesterday_titles: ["Workout", "Reading"],
			carry_forward_count: 1,
			carry_forward_titles: ["Workout"],
			highest_priority_task_title: "Deep work block",
			highest_priority_message: null,
			estimated_tasks_count: 1,
			estimated_workload_minutes: 60,
			workload_label: "Light",
			habit_streak_summary: [
				{
					task_title: "Deep work block",
					highest_streak_days: 5,
					current_streak_days: 4,
					completion_rate_percent: 80,
					last_completed_days_ago: 1,
					at_risk: true,
				},
			],
		},
		execution_order: [
			{
				task_id: tasks[0].id,
				title: tasks[0].title,
				source: tasks[0].source,
				priority: tasks[0].priority,
				estimated_duration_minutes: tasks[0].estimated_duration_minutes,
				suggested_start_time: tasks[0].suggested_start_time,
				suggested_finish_by_time: tasks[0].suggested_finish_by_time,
			},
		],
		generated_at: null,
		...overrides,
	};
}

function renderPage() {
	return render(
		<ToastProvider>
			<MemoryRouter>
				<PlanPage />
			</MemoryRouter>
		</ToastProvider>,
	);
}

describe("PlanPage", () => {
	beforeEach(() => {
		mockedGoalsApi.list.mockReset();
		mockedPlanApi.workspace.mockReset();
		mockedPlanApi.generateToday.mockReset();
		mockedPlanApi.create.mockReset();
		mockedPlanApi.update.mockReset();
		mockedPlanApi.logProgress.mockReset();
		mockedPlanApi.remove.mockReset();

		mockedGoalsApi.list.mockResolvedValue([]);
		mockedPlanApi.workspace.mockResolvedValue(buildWorkspace());
		mockedPlanApi.generateToday.mockResolvedValue(buildWorkspace());
		mockedPlanApi.create.mockResolvedValue(buildTask({ id: 20, title: "New task" }));
		mockedPlanApi.update.mockResolvedValue(buildTask({ status: "done" }));
		mockedPlanApi.logProgress.mockResolvedValue(buildWorkspace());
		mockedPlanApi.remove.mockResolvedValue(undefined);
	});

	it("renders daily insights and maps habit streak details into suggested order", async () => {
		renderPage();

		expect(await screen.findByText("Daily insights")).toBeInTheDocument();
		expect(screen.getByText("Missed yesterday")).toBeInTheDocument();
		expect(screen.getByText("Carry forward")).toBeInTheDocument();
		expect(screen.getByText("Your next task:")).toBeInTheDocument();
		expect(screen.queryByText("Habit streak summary")).not.toBeInTheDocument();
		expect(screen.getByText(/Max streak:\s*5d/i)).toBeInTheDocument();
		expect(screen.getByText(/Current streak:\s*4d/i)).toBeInTheDocument();
		expect(screen.getAllByText(/Deep work block/i).length).toBeGreaterThan(0);
		expect(screen.getByText("Impact if skipped:")).toBeInTheDocument();
	});

	it("shows motivation message when no highest-priority task remains", async () => {
		mockedPlanApi.workspace.mockResolvedValue(
			buildWorkspace({
				tasks: [buildTask({ status: "done" })],
				insights: {
					...buildWorkspace().insights,
					highest_priority_task_title: null,
					highest_priority_message: "All planned work is complete. Keep this momentum going.",
				},
			}),
		);

		renderPage();

		expect(
			await screen.findByText("All planned work is complete. Keep this momentum going."),
		).toBeInTheDocument();
	});

	it("generates plan for selected date via CTA", async () => {
		const user = userEvent.setup();

		mockedPlanApi.generateToday.mockResolvedValue(
			buildWorkspace({
				tasks: [buildTask({ id: 42, title: "AI Focus Block", source: "ai_generated" })],
				execution_order: [
					{
						task_id: 42,
						title: "AI Focus Block",
						source: "ai_generated",
						priority: "high",
						estimated_duration_minutes: 50,
						suggested_start_time: "09:00",
						suggested_finish_by_time: "09:50",
					},
				],
			}),
		);

		renderPage();

		await user.click(await screen.findByRole("button", { name: "Generate Today's Plan" }));

		expect(mockedPlanApi.generateToday).toHaveBeenCalledWith({ on_date: toISODate() });
		expect((await screen.findAllByText(/AI Focus Block/i)).length).toBeGreaterThan(0);
	});

	it("supports manual task creation", async () => {
		const user = userEvent.setup();

		mockedGoalsApi.list.mockResolvedValue([{ id: 1, title: "Ship MVP" }]);
		mockedPlanApi.workspace.mockResolvedValueOnce(buildWorkspace({ tasks: [] }));
		mockedPlanApi.workspace.mockResolvedValueOnce(
			buildWorkspace({
				tasks: [buildTask({ id: 20, title: "New task" })],
			}),
		);

		renderPage();

		await user.type(await screen.findByPlaceholderText("What will you get done?"), "New task");
		await user.click(screen.getByRole("button", { name: /add/i }));

		expect(mockedPlanApi.create).toHaveBeenCalledWith({
			title: "New task",
			date: toISODate(),
			related_goal_id: null,
		});
	});

	it("toggles completion without reloading workspace", async () => {
		const user = userEvent.setup();

		mockedPlanApi.workspace.mockResolvedValue(buildWorkspace());
		mockedPlanApi.update.mockResolvedValue(buildTask({ status: "done" }));

		renderPage();

		await user.click(await screen.findByRole("button", { name: "Mark as done" }));

		expect(mockedPlanApi.update).toHaveBeenCalledWith(1, { status: "done" });
		expect(mockedPlanApi.workspace).toHaveBeenCalledTimes(1);
		expect(
			await screen.findByText("All planned work is complete. Keep this momentum going."),
		).toBeInTheDocument();
		expect(screen.getByText(/Max streak:\s*5d/i)).toBeInTheDocument();
		expect(screen.getByText(/Current streak:\s*5d/i)).toBeInTheDocument();
	});

	it("keeps completed tasks visible in today's plan summary", async () => {
		const completedTask = buildTask({
			id: 99,
			title: "Completed Retrospective",
			status: "done",
			execution_order: 2,
			suggested_start_time: "19:00",
			suggested_finish_by_time: "19:30",
		});

		mockedPlanApi.workspace.mockResolvedValue(
			buildWorkspace({
				tasks: [buildTask(), completedTask],
				execution_order: [
					{
						task_id: 1,
						title: "Deep work block",
						source: "manual",
						priority: "high",
						estimated_duration_minutes: 60,
						suggested_start_time: "09:00",
						suggested_finish_by_time: "10:00",
					},
				],
			}),
		);

		renderPage();

		expect(await screen.findByText("Today's plan summary")).toBeInTheDocument();
		expect(screen.getAllByText("Completed Retrospective").length).toBeGreaterThan(0);
		expect(screen.getByText("Done")).toBeInTheDocument();
	});

	it("logs linked habit progress from task row", async () => {
		const user = userEvent.setup();

		mockedPlanApi.workspace.mockResolvedValue(
			buildWorkspace({
				tasks: [
					buildTask({
						linked_metrics: [
							{
								metric_id: 11,
								label: "Problems solved",
								unit_text: "problems",
								target: 10,
								time_span: "day",
								time_span_custom_text: null,
								logged_total: 0,
							},
						],
					}),
				],
			}),
		);

		mockedPlanApi.logProgress.mockResolvedValue(
			buildWorkspace({
				tasks: [
					buildTask({
						linked_metrics: [
							{
								metric_id: 11,
								label: "Problems solved",
								unit_text: "problems",
								target: 10,
								time_span: "day",
								time_span_custom_text: null,
								logged_total: 7,
							},
						],
					}),
				],
			}),
		);

		renderPage();

		const amountInput = await screen.findByLabelText("Progress amount");
		expect(screen.queryByRole("button", { name: "Mark as done" })).not.toBeInTheDocument();
		await user.type(amountInput, "7");
		await user.click(screen.getByRole("button", { name: "Save" }));

		expect(mockedPlanApi.logProgress).toHaveBeenCalledWith(1, {
			value: 7,
			mode: "set",
			metric_id: 11,
		});
	});
});
