import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dropdown } from "react-bootstrap";
import { PencilSquare, ThreeDotsVertical, Check2Circle, Trash3, DashLg, PlusLg, Floppy } from "react-bootstrap-icons";
import { useNavigate } from "react-router-dom";

import { api, type TaskDataResponse, type TaskStatus } from "@/api";
import { ApiError } from "@/api/client";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { checkAndConvertPluralWord } from "@/services/word-plurality.service";
import { ROUTES } from "@/routes/RoutePaths";

import "@/pages/my_goals/MilestoneTasksList/MilestoneTasksList.scss";

interface MilestoneTasksListProps {
	goalId: number;
	milestoneId: number;
}

const STATUS_PILL_CLASS: Record<TaskDataResponse["status"], string> = {
	"Not Started": "pill",
	"In Progress": "pill pill-info",
	"Paused": "pill pill-warn",
	"Completed": "pill pill-success",
	"Cancelled": "pill pill-danger",
};

const NUMERIC_STATUS_CYCLE: TaskStatus[] = ["Not Started", "In Progress", "Paused", "Completed", "Cancelled"];
const BINARY_STATUS_CYCLE: TaskStatus[] = ["Not Started", "Completed", "Cancelled"];

function toPercent(current: number | null, target: number | null): number | null {
	if (current === null || target === null || target <= 0) return null;
	return Math.max(0, Math.min(100, Math.round((current / target) * 100)));
}

export function MilestoneTasksList({ goalId, milestoneId }: MilestoneTasksListProps) {
	const navigate = useNavigate();
	
	const [tasks, setTasks] = useState<TaskDataResponse[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [busyId, setBusyId] = useState<number | null>(null);
	const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
	const [deleteBusy, setDeleteBusy] = useState(false);
	const [progressDrafts, setProgressDrafts] = useState<Record<number, number>>({});
	const [savingProgressId, setSavingProgressId] = useState<number | null>(null);
	const holdTimeoutRef = useRef<number | null>(null);
	const holdIntervalRef = useRef<number | null>(null);

	const loadTasks = useCallback(async () => {
		setLoading(true);
		setError(null);

		try {
			const data = await api.tasks.getList(milestoneId);
			setTasks(data);
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "Could not load tasks for this milestone.");
		} finally {
			setLoading(false);
		}
	}, [milestoneId]);

	useEffect(() => {
		void loadTasks();
	}, [loadTasks]);

	useEffect(() => {
		return () => {
			if (holdTimeoutRef.current !== null) {
				window.clearTimeout(holdTimeoutRef.current);
				holdTimeoutRef.current = null;
			}
			if (holdIntervalRef.current !== null) {
				window.clearInterval(holdIntervalRef.current);
				holdIntervalRef.current = null;
			}
		};
	}, []);

	const sortedTasks = useMemo(
		() => [...tasks].sort((a, b) => a.position - b.position || a.id - b.id),
		[tasks],
	);

	async function setStatus(task: TaskDataResponse, status: TaskStatus): Promise<boolean> {
		if (task.status === status) return false;

		setBusyId(task.id);
		try {
			const updated = await api.tasks.update(task.id, { status });
			setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
			return true;
		} catch (err) {
			setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
			setError(err instanceof ApiError ? err.message : "Could not update task status.");
			return false;
		} finally {
			setBusyId(null);
		}
	}

	function getStatusCycle(task: TaskDataResponse): TaskStatus[] {
		return task.task_type === "Binary" ? BINARY_STATUS_CYCLE : NUMERIC_STATUS_CYCLE;
	}

	function getEffectiveCurrentValue(task: TaskDataResponse): number {
		if (typeof progressDrafts[task.id] === "number") return progressDrafts[task.id];
		return task.current_value ?? 0;
	}

	function changeProgress(task: TaskDataResponse, delta: number) {
		const target = task.target_value ?? 0;
		if (target <= 0) return;

		const baseCurrent = task.current_value ?? 0;
		setProgressDrafts((prev) => {
			const current = typeof prev[task.id] === "number" ? prev[task.id] : baseCurrent;
			const next = Math.max(0, Math.min(target, current + delta));

			if (next === baseCurrent) {
				if (!(task.id in prev)) return prev;
				const nextDrafts = { ...prev };
				delete nextDrafts[task.id];
				return nextDrafts;
			}

			if (prev[task.id] === next) return prev;
			return { ...prev, [task.id]: next };
		});
	}

	function stopProgressHold() {
		if (holdTimeoutRef.current !== null) {
			window.clearTimeout(holdTimeoutRef.current);
			holdTimeoutRef.current = null;
		}
		if (holdIntervalRef.current !== null) {
			window.clearInterval(holdIntervalRef.current);
			holdIntervalRef.current = null;
		}
	}

	function startProgressHold(task: TaskDataResponse, delta: number) {
		stopProgressHold();

		// Single step immediately on press.
		changeProgress(task, delta);

		// Start repeating if the user keeps holding.
		holdTimeoutRef.current = window.setTimeout(() => {
			holdIntervalRef.current = window.setInterval(() => {
				changeProgress(task, delta);
			}, 90);
		}, 260);
	}

	async function saveProgress(task: TaskDataResponse) {
		const nextCurrent = progressDrafts[task.id];
		if (typeof nextCurrent !== "number") return;

		setSavingProgressId(task.id);
		try {
			const updated = await api.tasks.update(task.id, { current_value: nextCurrent });
			setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
			setProgressDrafts((prev) => {
				const nextDrafts = { ...prev };
				delete nextDrafts[task.id];
				return nextDrafts;
			});
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "Could not update task progress.");
		} finally {
			setSavingProgressId(null);
		}
	}

	async function handleDelete(taskId: number) {
		setDeleteBusy(true);
		setBusyId(taskId);
		try {
			await api.tasks.remove(taskId);
			setTasks((prev) => prev.filter((task) => task.id !== taskId));
			setConfirmDeleteId(null);
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "Could not delete task.");
		} finally {
			setDeleteBusy(false);
			setBusyId(null);
		}
	}

	const confirmDeleteTarget = tasks.find((task) => task.id === confirmDeleteId) ?? null;

	if (!loading && !error && sortedTasks.length === 0) {
		return null;
	}

	return (
		<section className={`milestone-tasks-subsection ${!loading && error ? "ps-0" : ""}`} aria-label="Milestone tasks">
			{loading && (
				<div className="milestone-tasks-skeleton" aria-busy="true" aria-live="polite">
					<div className="milestone-tasks-skeleton-line is-title" />
					<div className="milestone-tasks-skeleton-line" />
					<div className="milestone-tasks-skeleton-line is-short" />
				</div>
			)}

			{!loading && error && (
				<p className="milestone-tasks-feedback milestone-tasks-feedback-error" role="status">
					{error}{" "}
					<button
						type="button"
						className="milestone-tasks-feedback-action"
						onClick={() => { void loadTasks(); }}
					>
						Try again
					</button>
				</p>
			)}

			{!loading && !error && sortedTasks.length > 0 && (
				<div className="milestone-tasks-list" role="list">
					{sortedTasks.map((task, index) => {
						const effectiveCurrentValue = getEffectiveCurrentValue(task);
						const progressPercent = toPercent(effectiveCurrentValue, task.target_value);
						const busy = busyId === task.id;
						const statusCycle = getStatusCycle(task);
						const canEditProgress = task.task_type === "Numeric" && !task.planning_enabled && progressPercent !== null;
						const hasProgressChanges = (task.current_value ?? 0) !== effectiveCurrentValue;
						const progressBusy = savingProgressId === task.id;

						if (busy) {
							return (
								<article
									key={task.id}
									className={`milestone-task-subitem milestone-task-subitem-skeleton${index > 0 ? " has-separator" : ""}`}
									role="listitem"
									aria-busy="true"
									aria-live="polite"
								>
									<div className="milestone-task-inline-skeleton" aria-hidden="true">
										<div className="milestone-task-inline-line is-title" />
										<div className="milestone-task-inline-line is-meta" />
										<div className="milestone-task-inline-line is-short" />
									</div>
								</article>
							);
						}

						return (
							<article
								key={task.id}
								className={`milestone-task-subitem${index > 0 ? " has-separator" : ""}`}
								role="listitem"
							>
								<div className="milestone-task-head align-items-center">
									<h5 className="milestone-task-title">{task.title}</h5>
									<div className="milestone-task-controls">
										<Dropdown align="end" className="flex-shrink-0">
											<Dropdown.Toggle
												as="button"
												className="btn p-0 border-0 bg-transparent shadow-none"
												disabled={busy}
												aria-label="Change task status"
												bsPrefix=" "
											>
												<span className={STATUS_PILL_CLASS[task.status]}>{task.status}</span>
											</Dropdown.Toggle>
											<Dropdown.Menu>
												{statusCycle.map((status) => (
													<Dropdown.Item
														key={status}
														active={task.status === status}
														onClick={() => { void setStatus(task, status); }}
													>
														{status}
													</Dropdown.Item>
												))}
											</Dropdown.Menu>
										</Dropdown>

										<Dropdown align="end" className="flex-shrink-0">
											<Dropdown.Toggle
												as="button"
												className="btn btn-ghost btn-icon border-0 goal-milestone-menu-btn"
												disabled={busy || deleteBusy}
												aria-label="Task options"
												bsPrefix=" "
											>
												<ThreeDotsVertical size={16} />
											</Dropdown.Toggle>
											<Dropdown.Menu>
												<Dropdown.Item onClick={() => navigate(
													ROUTES.MY_GOAL_MILESTONE_TASK_EDIT
														.replace(":goalId", String(goalId))
														.replace(":milestoneId", String(milestoneId))
														.replace(":taskId", String(task.id))
												)}>
													<PencilSquare size={14} className="me-2" /> Edit
												</Dropdown.Item>
												<Dropdown.Item className="text-danger" onClick={() => setConfirmDeleteId(task.id)}>
													<Trash3 size={14} className="me-2" /> Delete
												</Dropdown.Item>
											</Dropdown.Menu>
										</Dropdown>
									</div>
								</div>

								{task.planning_enabled && (task.planner_target || 0) > 1 ? (
									<>
										<div className="milestone-task-meta">
											{(task.planner_target && task.value_unit) && (
												<span className="pill pill-info milestone-task-chip-font">
													<Check2Circle size={12} />
													<span>
														{task.planner_target} {
															task.planner_target === 1
																? checkAndConvertPluralWord(task.value_unit).singular
																: task.value_unit
														} per session.
													</span>
												</span>
											)}
										</div>
										{task.note && <p className="milestone-task-note mt-2 pe-2">{task.note}</p>}
									</>
								) : task.note && (
									<p className="milestone-task-note">{task.note}</p>
								)}

								{task.task_type === "Numeric" && progressPercent !== null && (
									<div className={`milestone-task-progress ${canEditProgress ? "mt-0" : "me-3"}`} aria-label="Numeric task progress">
										<span className="milestone-task-progress-left">
											{(task.target_value ?? 0) - effectiveCurrentValue}
											{task.value_unit ? ` ${task.value_unit}` : " Units"} left
										</span>
										<div className="milestone-task-progress-track" aria-hidden="true">
											<div className="milestone-task-progress-bar" style={{ width: `${progressPercent}%` }} />
										</div>
										<span className="milestone-task-progress-right">
											{progressPercent}%
										</span>

										{canEditProgress && (
											<div className="milestone-task-progress-actions">
												{hasProgressChanges && (
													<button
														type="button"
														className="btn btn-ghost btn-icon border-0 milestone-task-progress-action milestone-task-progress-action-save"
														aria-label="Save task progress"
														onClick={() => { void saveProgress(task); }}
														disabled={busy || deleteBusy || progressBusy}
													>
														<Floppy size={14} />
													</button>
												)}
												<button
													type="button"
													className="btn btn-ghost btn-icon border-0 milestone-task-progress-action"
													aria-label="Decrease task progress"
													onPointerDown={() => startProgressHold(task, -1)}
													onPointerUp={stopProgressHold}
													onPointerCancel={stopProgressHold}
													onPointerLeave={stopProgressHold}
													disabled={busy || deleteBusy || progressBusy || effectiveCurrentValue <= 0}
												>
													<DashLg size={14} />
												</button>
												<button
													type="button"
													className="btn btn-ghost btn-icon border-0 milestone-task-progress-action"
													aria-label="Increase task progress"
													onPointerDown={() => startProgressHold(task, 1)}
													onPointerUp={stopProgressHold}
													onPointerCancel={stopProgressHold}
													onPointerLeave={stopProgressHold}
													disabled={busy || deleteBusy || progressBusy || effectiveCurrentValue >= (task.target_value ?? 0)}
												>
													<PlusLg size={14} />
												</button>
											</div>
										)}
									</div>
								)}
							</article>
						);
					})}
				</div>
			)}

			<ConfirmDialog
				show={confirmDeleteId !== null}
				title="Delete this task?"
				message={
					confirmDeleteTarget
						? `"${confirmDeleteTarget.title}" will be permanently removed.`
						: undefined
				}
				confirmLabel="Delete"
				destructive
				busy={deleteBusy}
				onConfirm={() => { if (confirmDeleteId !== null) void handleDelete(confirmDeleteId); }}
				onCancel={() => setConfirmDeleteId(null)}
			/>

		</section>
	);
}
