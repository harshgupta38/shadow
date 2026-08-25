import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check2Circle, X } from "react-bootstrap-icons";
import { useNavigate, useParams } from "react-router-dom";

import { api, type GoalDataResponse, type MilestoneDataResponse, type TaskDataResponse, type TaskType, type TaskPreferredTime } from "@/api";
import { ApiError } from "@/api/client";
import LOADING_IMAGE from "@/assets/loading_default.png";
import { StepImageVisual } from "@/components/ui/StepImageVisual/StepImageVisual";
import { ThemeToggle } from "@/components/ui/ThemeToggle/ThemeToggle";
import { useToast } from "@/context/ToastContext";
import { ROUTES } from "@/routes/RoutePaths";

import { GoalWizardVisual } from "@/pages/my_goals/GoalCreationWizard/GoalWizardVisual";
import {
	EMPTY_ANSWERS,
	FREQ_DAYS,
	FREQ_PERIODS,
	FREQUENCY_OPTIONS,
	GOAL_LOADER_STEPS,
	MINUTES,
	PREFERRED_TIME_OPTIONS,
	PRIORITY_OPTIONS,
	STEPS,
	type TaskWizardAnswers,
	type TaskWizardStepKey,
} from "@/pages/my_goals/GoalTaskWizard/GoalTaskWizard.constants";

import "@/pages/my_goals/GoalCreationWizard/GoalCreationWizard.scss";
import "@/pages/my_goals/GoalMilestoneWizard/GoalMilestoneWizardPage.scss";
import "@/pages/my_goals/GoalTaskWizard/GoalTaskWizardPage.scss";

const LOADER_VISUAL_IMAGES = [LOADING_IMAGE];

type TaskFieldErrorKey =
	| "title"
	| "taskType"
	| "targetValue"
	| "valueUnit"
	| "plannerTarget"
	| "frequencies"
	| "specificTime";

type TaskFieldErrors = Partial<Record<TaskFieldErrorKey, string>>;

// ── Parsing helpers ───────────────────────────────────────────────────────────

function parseOptionalNumber(raw: string): number | null {
	const trimmed = raw.trim();
	if (!trimmed) return null;
	const parsed = Number(trimmed);
	return Number.isFinite(parsed) ? parsed : null;
}

function parseRequiredPositive(raw: string): number | null {
	const parsed = parseOptionalNumber(raw);
	return parsed !== null && parsed > 0 ? parsed : null;
}

function parseOptionalPositiveInt(raw: string): number | null {
	const parsed = parseOptionalNumber(raw);
	return parsed !== null && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function trimOrNull(raw: string): string | null {
	const t = raw.trim();
	return t || null;
}

function buildTime(h: string, m: string, a: string): string {
	let hour = parseInt(h, 10);
	if (a === "PM" && hour !== 12) hour += 12;
	if (a === "AM" && hour === 12) hour = 0;
	return `${String(hour).padStart(2, "0")}:${m}`;
}

function parseTime(t: string): { h: string; m: string; a: string } {
	if (!t) return { h: "8", m: "00", a: "AM" };
	const [hh, mm] = t.split(":");
	const h24 = parseInt(hh, 10);
	return {
		h: String(h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24),
		m: mm ?? "00",
		a: h24 < 12 ? "AM" : "PM",
	};
}

// ── Frequency chip logic (mirrors HabitFormPanel) ─────────────────────────────

function computeDisabledFreqs(freqs: string[], hasSpecificDay: boolean): Set<string> {
	const d = new Set<string>();

	if (freqs.includes("daily")) {
		[...FREQ_DAYS, ...FREQ_PERIODS, "specific_day"].filter((v) => v !== "daily").forEach((v) => d.add(v));
		return d;
	}

	const GROUP_A = ["weekly", "monthly", "weekdays", "weekends"];
	const hasGroupA = freqs.some((f) => GROUP_A.includes(f));

	// Group A items or an open specific-day picker block all other period chips + all day chips.
	if (hasGroupA || hasSpecificDay) {
		(FREQ_PERIODS as readonly string[]).forEach((v) => { if (!freqs.includes(v)) d.add(v); });
		FREQ_DAYS.forEach((v) => d.add(v));
	}

	// first_of_month blocks everything except end_of_month.
	if (freqs.includes("first_of_month")) {
		GROUP_A.forEach((v) => d.add(v));
		FREQ_DAYS.forEach((v) => d.add(v));
		d.add("specific_day");
	}

	// end_of_month blocks everything except first_of_month.
	if (freqs.includes("end_of_month")) {
		GROUP_A.forEach((v) => d.add(v));
		FREQ_DAYS.forEach((v) => d.add(v));
		d.add("specific_day");
	}

	// weekdays/weekends also disable their respective individual day chips.
	if (freqs.includes("weekdays")) ["monday","tuesday","wednesday","thursday","friday"].forEach((v) => d.add(v));
	if (freqs.includes("weekends")) ["saturday","sunday"].forEach((v) => d.add(v));

	return d;
}

// ── Normalization ─────────────────────────────────────────────────────────────

function normalizeForType(answers: TaskWizardAnswers): TaskWizardAnswers {
	if (answers.taskType === "Binary") {
		return {
			...answers,
			targetValue: "",
			valueUnit: "",
			plannerTarget: "",
			planningEnabled: false,
			frequencies: [],
			specificDays: [],
		};
	}
	return answers;
}

// ── Error mapping ─────────────────────────────────────────────────────────────

function mapTaskFieldErrors(fieldErrors: Partial<Record<string, string>>): TaskFieldErrors {
	const mapped: TaskFieldErrors = {};
	const aliases: Record<TaskFieldErrorKey, string[]> = {
		title:        ["title"],
		taskType:     ["task_type"],
		targetValue:  ["target_value"],
		valueUnit:    ["value_unit"],
		plannerTarget: ["planner_target"],
		frequencies:  ["frequencies"],
		specificTime: ["specific_time"],
	};
	for (const key of Object.keys(aliases) as TaskFieldErrorKey[]) {
		const match = aliases[key].find((alias) => {
			const msg = fieldErrors[alias];
			return typeof msg === "string" && msg.trim().length > 0;
		});
		if (match) mapped[key] = String(fieldErrors[match]);
	}
	return mapped;
}

function getStepBannerError(stepKey: TaskWizardStepKey, fieldErrors: TaskFieldErrors): string | null {
	if (stepKey === "defineTask")        return fieldErrors.title ?? fieldErrors.taskType ?? null;
	if (stepKey === "configureProgress") return fieldErrors.targetValue ?? fieldErrors.valueUnit ?? null;
	if (stepKey === "configurePlanning") return fieldErrors.plannerTarget ?? fieldErrors.frequencies ?? null;
	if (stepKey === "additionalDetails") return fieldErrors.specificTime ?? null;
	return null;
}

// ── Per-step validation ───────────────────────────────────────────────────────

function getStepValidationErrors(stepKey: TaskWizardStepKey, answers: TaskWizardAnswers): TaskFieldErrors {
	const errs: TaskFieldErrors = {};

	if (stepKey === "defineTask") {
		if (!answers.title.trim()) errs.title = "Please provide a title.";
		if (answers.taskType !== "Binary" && answers.taskType !== "Numeric") errs.taskType = "Please select a task type.";
		return errs;
	}

	if (stepKey === "configureProgress") {
		if (parseRequiredPositive(answers.targetValue) === null) errs.targetValue = "Target value must be greater than 0.";
		if (!answers.valueUnit.trim()) errs.valueUnit = "Value unit is required for Numeric tasks.";
		return errs;
	}

	if (stepKey === "configurePlanning") {
		if (!answers.planningEnabled) return errs;
		if (answers.taskType === "Numeric" && parseRequiredPositive(answers.plannerTarget) === null) {
			errs.plannerTarget = "Planner target must be greater than 0.";
		}
		if (answers.frequencies.length === 0) errs.frequencies = "Please select at least one frequency.";
		return errs;
	}

	return errs;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function GoalTaskWizardPage() {
	const { goalId, milestoneId, taskId } = useParams();
	const navigate = useNavigate();
	const toast = useToast();

	const isEditMode = Boolean(taskId);
	const numericTaskId = Number(taskId);
	const numericGoalId = Number(goalId);
	const numericMilestoneId = Number(milestoneId);

	const [goal, setGoal] = useState<GoalDataResponse | null>(null);
	const [milestone, setMilestone] = useState<MilestoneDataResponse | null>(null);
	const [loadingContext, setLoadingContext] = useState(true);
	const [loaderIndex, setLoaderIndex] = useState(0);
	const [currentStepIndex, setCurrentStepIndex] = useState(0);
	const [answers, setAnswers] = useState<TaskWizardAnswers>(EMPTY_ANSWERS);
	const [fieldErrors, setFieldErrors] = useState<TaskFieldErrors>({});
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	// Specific-day picker state (derived from answers.specificDays / frequencies)
	const [dayPickerOpen, setDayPickerOpen] = useState(false);

	// Numeric tasks: all 4 steps. Binary tasks: defineTask + additionalDetails only.
	const visibleSteps = useMemo(
		() => (answers.taskType === "Numeric"
			? STEPS
			: STEPS.filter((step) => step.key === "defineTask" || step.key === "additionalDetails")),
		[answers.taskType],
	);

	useEffect(() => {
		setCurrentStepIndex((cur) => Math.min(cur, visibleSteps.length - 1));
	}, [visibleSteps.length]);

	// ── Load context ──────────────────────────────────────────────────────────
	useEffect(() => {
		if (!Number.isInteger(numericGoalId) || numericGoalId <= 0
			|| !Number.isInteger(numericMilestoneId) || numericMilestoneId <= 0) {
			toast.error("Milestone not found.");
			navigate(ROUTES.MY_GOALS, { replace: true });
			return;
		}
		if (isEditMode && (!Number.isInteger(numericTaskId) || numericTaskId <= 0)) {
			toast.error("Task not found.");
			navigate(ROUTES.MY_GOALS, { replace: true });
			return;
		}

		setLoadingContext(true);

		const requests: [Promise<GoalDataResponse>, Promise<MilestoneDataResponse>, Promise<TaskDataResponse | null>] = [
			api.goals.getDetail(numericGoalId),
			api.milestones.getDetail(numericMilestoneId),
			isEditMode ? api.tasks.getDetail(numericTaskId) : Promise.resolve(null),
		];

		void Promise.all(requests)
			.then(([goalResponse, milestoneResponse, taskResponse]) => {
				if (milestoneResponse.goal_id !== goalResponse.id) {
					toast.error("Milestone does not belong to this goal.");
					navigate(ROUTES.MY_GOALS, { replace: true });
					return;
				}

				setGoal(goalResponse);
				setMilestone(milestoneResponse);

				if (taskResponse) {
					const specificTime = taskResponse.specific_time ?? "";
					setAnswers({
						title: taskResponse.title,
						note: taskResponse.note ?? "",
						taskType: taskResponse.task_type,
						targetValue: taskResponse.target_value !== null ? String(taskResponse.target_value) : "",
						valueUnit: taskResponse.value_unit ?? "",
						planningEnabled: taskResponse.planning_enabled,
						plannerTarget: taskResponse.planner_target !== null ? String(taskResponse.planner_target) : "",
						frequencies: taskResponse.frequencies ?? [],
						priority: taskResponse.priority,
						preferredTime: taskResponse.preferred_time,
						specificTime: specificTime,
						durationMinutes: taskResponse.duration_minutes !== null ? String(taskResponse.duration_minutes) : "",

						weeklyCount: taskResponse.weekly_count ?? 1,
						monthlyCount: taskResponse.monthly_count ?? 1,
						specificDays: taskResponse.specific_days ?? [],
						dayFallback: taskResponse.day_fallback,
					});
					if ((taskResponse.specific_days?.length ?? 0) > 0 || taskResponse.frequencies?.includes("specific_day")) {
						setDayPickerOpen(true);
					}
				}

				setLoadingContext(false);
			})
			.catch((requestError) => {
				if (requestError instanceof ApiError) {
					toast.error(requestError.status === 404 ? "Task not found." : requestError.message);
				} else {
					toast.error("Could not load context right now.");
				}
				navigate(ROUTES.MY_GOALS, { replace: true });
			});
	}, [navigate, numericGoalId, numericMilestoneId, numericTaskId, isEditMode, toast]);

	useEffect(() => {
		if (!loadingContext) { setLoaderIndex(0); return; }
		const interval = window.setInterval(() => {
			setLoaderIndex((cur) => Math.min(cur + 1, GOAL_LOADER_STEPS.length - 1));
		}, 1100);
		return () => window.clearInterval(interval);
	}, [loadingContext]);

	// ── Answer helpers ────────────────────────────────────────────────────────
	function updateAnswer<K extends keyof TaskWizardAnswers>(key: K, value: TaskWizardAnswers[K]) {
		setAnswers((cur) => normalizeForType({ ...cur, [key]: value }));
		setFieldErrors((cur) => {
			if (!(key in cur)) return cur;
			const next = { ...cur };
			delete next[key as TaskFieldErrorKey];
			return next;
		});
		setError(null);
	}

	function toggleFrequency(value: string) {
		const adding = !answers.frequencies.includes(value);
		if (adding && value === "daily") {
			updateAnswer("specificDays", []);
			setDayPickerOpen(false);
		}

		setAnswers((cur) => {
			let freqs = cur.frequencies;
			if (freqs.includes(value)) {
				freqs = freqs.filter((f) => f !== value);
			} else {
				freqs = [...freqs, value];
				if (value === "daily") freqs = ["daily"];
				if (value === "weekly") freqs = freqs.filter((f) => f !== "monthly" && !FREQ_DAYS.includes(f as typeof FREQ_DAYS[number]));
				if (value === "monthly") freqs = freqs.filter((f) => !["weekly","weekdays","weekends"].includes(f) && !FREQ_DAYS.includes(f as typeof FREQ_DAYS[number]));
				if (value === "first_of_month" || value === "end_of_month") freqs = freqs.filter((f) => !FREQ_DAYS.includes(f as typeof FREQ_DAYS[number]));
			}
			return normalizeForType({ ...cur, frequencies: freqs });
		});
		setFieldErrors((cur) => { const n = {...cur}; delete n.frequencies; return n; });
		setError(null);
	}

	function toggleSpecificDay(day: number) {
		setAnswers((cur) => {
			const days = cur.specificDays.includes(day)
				? cur.specificDays.filter((d) => d !== day)
				: [...cur.specificDays, day].sort((a, b) => a - b);
			let freqs = cur.frequencies;
			if (days.length > 0 && !freqs.includes("specific_day")) freqs = [...freqs, "specific_day"];
			if (days.length === 0) freqs = freqs.filter((f) => f !== "specific_day");
			return normalizeForType({ ...cur, specificDays: days, frequencies: freqs });
		});
	}

	// ── Specific time picker derived state ───────────────────────────────────
	const parsedSpecificTime = useMemo(() => parseTime(answers.specificTime), [answers.specificTime]);

	function setSpecificTimePart(part: "h" | "m" | "a", val: string) {
		const p = { ...parsedSpecificTime, [part]: val };
		updateAnswer("specificTime", buildTime(p.h, p.m, p.a));
	}

	// ── Validation ────────────────────────────────────────────────────────────
	function validateForSubmit(): TaskFieldErrors {
		const errs: TaskFieldErrors = {};
		for (const step of visibleSteps) Object.assign(errs, getStepValidationErrors(step.key, answers));
		return errs;
	}

	function goNextFrom(stepIndex: number) {
		const step = visibleSteps[stepIndex];
		if (!step) return;
		const nextErrors = getStepValidationErrors(step.key, answers);
		if (Object.keys(nextErrors).length > 0) {
			setFieldErrors((cur) => ({ ...cur, ...nextErrors }));
			setCurrentStepIndex(stepIndex);
			return;
		}
		setCurrentStepIndex(Math.min(stepIndex + 1, visibleSteps.length - 1));
	}

	// ── Submit ────────────────────────────────────────────────────────────────
	async function handleSubmit() {
		const nextErrors = validateForSubmit();
		if (Object.keys(nextErrors).length > 0) {
			setFieldErrors(nextErrors);
			setCurrentStepIndex(0);
			return;
		}

		setSubmitting(true);
		setError(null);
		setFieldErrors({});

		try {
			const taskType: TaskType = answers.taskType;
			const isNumeric = taskType === "Numeric";
			const isPlanned = answers.planningEnabled;
			// Always build from the displayed selects — parsedSpecificTime defaults to
			// 8:00 AM when specificTime is empty, matching what the user sees.
			const specificTimeOut = answers.preferredTime === "custom"
				? buildTime(parsedSpecificTime.h, parsedSpecificTime.m, parsedSpecificTime.a)
				: null;

			const schedulingPayload = {
				planning_enabled: isPlanned,
				frequencies: isPlanned ? answers.frequencies : [],
				priority: answers.priority,
				preferred_time: answers.preferredTime,
				specific_time: specificTimeOut,
				duration_minutes: parseOptionalPositiveInt(answers.durationMinutes),

				weekly_count: answers.frequencies.includes("weekly") ? answers.weeklyCount : null,
				monthly_count: answers.frequencies.includes("monthly") ? answers.monthlyCount : null,
				specific_days: answers.specificDays.length > 0 ? answers.specificDays : null,
				day_fallback: answers.dayFallback,
			};

			if (isEditMode) {
				await api.tasks.update(numericTaskId, {
					title: answers.title.trim(),
					task_type: taskType,
					target_value: isNumeric ? parseRequiredPositive(answers.targetValue) : null,
					value_unit: isNumeric ? trimOrNull(answers.valueUnit) : null,
					planner_target: isNumeric && isPlanned ? parseRequiredPositive(answers.plannerTarget) : null,
					note: trimOrNull(answers.note),
					...schedulingPayload,
				});
				toast.success("Task updated successfully.");
			} else {
				await api.tasks.save({
					goal_id: numericGoalId,
					milestone_id: numericMilestoneId,
					title: answers.title.trim(),
					task_type: taskType,
					current_value: isNumeric ? 0 : null,
					target_value: isNumeric ? parseRequiredPositive(answers.targetValue) : null,
					value_unit: isNumeric ? trimOrNull(answers.valueUnit) : null,
					planner_target: isNumeric && isPlanned ? parseRequiredPositive(answers.plannerTarget) : null,
					assistant_context: null,
					note: trimOrNull(answers.note),
					...schedulingPayload,
				});
				toast.success("Task created successfully.");
			}

			navigate(ROUTES.MY_GOAL_DETAIL.replace(":goalId", String(numericGoalId)));
		} catch (submitError) {
			if (submitError instanceof ApiError) {
				const mapped = mapTaskFieldErrors(submitError.fieldErrors ?? {});
				if (Object.keys(mapped).length > 0) {
					setFieldErrors(mapped);
					const errorStepIndex = visibleSteps.findIndex(
						(step) => getStepBannerError(step.key, mapped) !== null,
					);
					setCurrentStepIndex(errorStepIndex >= 0 ? errorStepIndex : 0);
					setError(null);
				} else {
					setError(submitError.message || "Could not save task right now.");
				}
			} else {
				setError("Could not save task right now.");
			}
		} finally {
			setSubmitting(false);
		}
	}

	const canGoNext = useMemo(() => {
		const activeStep = visibleSteps[currentStepIndex];
		if (!activeStep) return false;
		return Object.keys(getStepValidationErrors(activeStep.key, answers)).length === 0;
	}, [answers, currentStepIndex, visibleSteps]);

	const canSubmit = useMemo(() => Object.keys(validateForSubmit()).length === 0, [answers, visibleSteps]);

	const currentSubtitle = goal && milestone ? `For ${goal.title} → ${milestone.title}` : null;
	const activeStepKey = visibleSteps[currentStepIndex]?.key ?? "defineTask";
	const stepBannerError = getStepBannerError(activeStepKey, fieldErrors);
	const displayError = stepBannerError ?? error;
	const loaderMessage = GOAL_LOADER_STEPS[Math.min(loaderIndex, GOAL_LOADER_STEPS.length - 1)];

	// ── Frequency chip disabled state ─────────────────────────────────────────
	const hasSpecificDay = answers.specificDays.length > 0;
	const disabledFreqs = useMemo(
		() => computeDisabledFreqs(answers.frequencies, hasSpecificDay),
		[answers.frequencies, hasSpecificDay],
	);

	// ── Planning section for configurePlanning step ───────────────────────────
	function renderSchedulingSection() {
		const isNumeric = answers.taskType === "Numeric";
		const isActive = visibleSteps[currentStepIndex]?.key === "configurePlanning";

		return (
			<div className="mt-3">
				{/* Planner target + Priority row */}
				<div className="row g-3 mb-3">
					{isNumeric && (
						<div className="col-md-6">
							<label className="form-label">
								How many {answers.valueUnit ? <strong>{answers.valueUnit}</strong> : "units"} per session?
							</label>
							<input
								type="number"
								className={`form-control ${fieldErrors.plannerTarget ? "is-invalid" : ""}`.trim()}
								value={answers.plannerTarget}
								onChange={(e) => updateAnswer("plannerTarget", e.target.value)}
								placeholder="10"
								min={1}
								step="any"
								disabled={!isActive || submitting}
							/>
							{fieldErrors.plannerTarget && (
								<div className="text-danger small mt-1">{fieldErrors.plannerTarget}</div>
							)}
						</div>
					)}
					<div className={isNumeric ? "col-md-6" : "col-12"}>
						<label className="form-label">Priority</label>
						<select
							className="form-select"
							value={answers.priority}
							onChange={(e) => updateAnswer("priority", e.target.value as typeof answers.priority)}
							disabled={!isActive || submitting}
						>
							{PRIORITY_OPTIONS.map((opt) => (
								<option key={opt.value} value={opt.value}>{opt.label}</option>
							))}
						</select>
					</div>
				</div>

				{/* Frequency chips */}
				<div className="mb-3">
					<label className="form-label">How often?</label>
					<p className="text-muted small mb-2">Task will appear in your daily plan on the selected days.</p>
					{fieldErrors.frequencies && (
						<div className="text-danger small mb-1">{fieldErrors.frequencies}</div>
					)}
					{/* Day chips */}
					<div className="d-flex flex-wrap gap-1 mb-1">
						{FREQUENCY_OPTIONS.filter((o) => (FREQ_DAYS as readonly string[]).includes(o.value)).map((opt) => {
							const active = answers.frequencies.includes(opt.value);
							const disabled = !isActive || submitting || disabledFreqs.has(opt.value);
							return (
								<button
									key={opt.value}
									type="button"
									className={`btn btn-sm ${active ? "btn-soft outline" : "btn-outline-secondary"}`.trim()}
									onClick={() => toggleFrequency(opt.value)}
									disabled={disabled}
									style={{ borderRadius: "2rem", fontSize: "0.8rem" }}
								>
									{opt.label}
								</button>
							);
						})}
					</div>
					{/* Period chips */}
					<div className="d-flex flex-wrap gap-1">
						{FREQUENCY_OPTIONS.filter((o) => (FREQ_PERIODS as readonly string[]).includes(o.value) || o.value === "specific_day").map((opt) => {
							const active = opt.value === "specific_day" ? dayPickerOpen : answers.frequencies.includes(opt.value);
							const disabled = !isActive || submitting || disabledFreqs.has(opt.value);
							return (
								<button
									key={opt.value}
									type="button"
									className={`btn btn-sm ${active ? "btn-soft outline" : "btn-outline-secondary"}`.trim()}
									onClick={() => {
										if (opt.value === "specific_day") {
											if (dayPickerOpen) {
												setDayPickerOpen(false);
												updateAnswer("specificDays", []);
											} else {
												setDayPickerOpen(true);
											}
										} else {
											toggleFrequency(opt.value);
										}
									}}
									disabled={disabled}
									style={{ borderRadius: "2rem", fontSize: "0.8rem" }}
								>
									{opt.label}
								</button>
							);
						})}
					</div>

					{/* Weekly count sub-option */}
					{answers.frequencies.includes("weekly") && (
						<div className="d-flex align-items-center gap-2 mt-2 p-2" style={{ border: "1.5px dashed var(--jv-faint, #d0d0d8)", borderRadius: "0.5rem" }}>
							<span className="text-muted small">Times per week:</span>
							<div className="d-inline-flex align-items-center gap-2">
								<button type="button" className="btn btn-sm btn-outline-secondary" style={{ width:"1.75rem",height:"1.75rem",padding:0,borderRadius:"50%",lineHeight:1,opacity:(!isActive||submitting||answers.weeklyCount<=1)?0.35:1,border:(!isActive||submitting||answers.weeklyCount<=1)?undefined:"1.5px solid var(--bs-secondary)" }}
									onClick={() => updateAnswer("weeklyCount", Math.max(1, answers.weeklyCount - 1))}
									disabled={!isActive || submitting || answers.weeklyCount <= 1}
								>−</button>
								<span style={{ minWidth:"1.5rem", textAlign:"center", fontWeight:600 }}>{answers.weeklyCount}</span>
								<button type="button" className="btn btn-sm btn-outline-secondary" style={{ width:"1.75rem",height:"1.75rem",padding:0,borderRadius:"50%",lineHeight:1,opacity:(!isActive||submitting||answers.weeklyCount>=6)?0.35:1,border:(!isActive||submitting||answers.weeklyCount>=6)?undefined:"1.5px solid var(--bs-secondary)" }}
									onClick={() => updateAnswer("weeklyCount", Math.min(6, answers.weeklyCount + 1))}
									disabled={!isActive || submitting || answers.weeklyCount >= 6}
								>+</button>
							</div>
						</div>
					)}

					{/* Monthly count sub-option */}
					{answers.frequencies.includes("monthly") && (
						<div className="d-flex align-items-center gap-2 mt-2 p-2" style={{ border: "1.5px dashed var(--jv-faint, #d0d0d8)", borderRadius: "0.5rem" }}>
							<span className="text-muted small">Times per month:</span>
							<div className="d-inline-flex align-items-center gap-2">
								<button type="button" className="btn btn-sm btn-outline-secondary" style={{ width:"1.75rem",height:"1.75rem",padding:0,borderRadius:"50%",lineHeight:1,opacity:(!isActive||submitting||answers.monthlyCount<=1)?0.35:1,border:(!isActive||submitting||answers.monthlyCount<=1)?undefined:"1.5px solid var(--bs-secondary)" }}
									onClick={() => updateAnswer("monthlyCount", Math.max(1, answers.monthlyCount - 1))}
									disabled={!isActive || submitting || answers.monthlyCount <= 1}
								>−</button>
								<span style={{ minWidth:"1.5rem", textAlign:"center", fontWeight:600 }}>{answers.monthlyCount}</span>
								<button type="button" className="btn btn-sm btn-outline-secondary" style={{ width:"1.75rem",height:"1.75rem",padding:0,borderRadius:"50%",lineHeight:1,opacity:(!isActive||submitting||answers.monthlyCount>=27)?0.35:1,border:(!isActive||submitting||answers.monthlyCount>=27)?undefined:"1.5px solid var(--bs-secondary)" }}
									onClick={() => updateAnswer("monthlyCount", Math.min(27, answers.monthlyCount + 1))}
									disabled={!isActive || submitting || answers.monthlyCount >= 27}
								>+</button>
							</div>
						</div>
					)}

					{/* Specific day grid */}
					{dayPickerOpen && (
						<div className="mt-2">
							<div style={{ display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:"0.375rem" }}>
								{Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
									const isSelected = answers.specificDays.includes(day);
									return (
										<button
											key={day}
											type="button"
											onClick={() => toggleSpecificDay(day)}
											disabled={!isActive || submitting}
											style={{
												height: "2.125rem",
												borderRadius: "0.4rem",
												border: `1px solid ${isSelected ? "var(--jv-brand-1, #6366f1)" : "var(--jv-border-strong, #dee2e6)"}`,
												background: isSelected ? "var(--jv-brand-1, #6366f1)" : "transparent",
												color: isSelected ? "#fff" : "inherit",
												fontSize: "0.8125rem",
												fontWeight: 500,
												cursor: "pointer",
											}}
										>
											{day}
										</button>
									);
								})}
							</div>
							{/* Day-fallback checkbox — only when a day ≥ 29 is selected */}
							{answers.specificDays.some((d) => d >= 29) && (
								<label className="d-flex align-items-center gap-2 mt-2 habit-fallback-label">
									<input
										type="checkbox"
										className="habit-checkbox"
										checked={answers.dayFallback}
										onChange={(e) => updateAnswer("dayFallback", e.target.checked)}
										disabled={!isActive || submitting}
										style={{ accentColor: "var(--jv-brand-1, #6366f1)" }}
									/>
									<span className="small">
										If any selected date ({answers.specificDays.filter((d) => d >= 29).join(", ")}) doesn't exist in a month, use the last day instead (skip otherwise)
									</span>
								</label>
							)}
						</div>
					)}
				</div>

			</div>
		);
	}

	// ── Loading state ─────────────────────────────────────────────────────────
	if (loadingContext) {
		return (
			<div className="goal-wizard-backdrop">
				<div className="goal-wizard-page-theme-toggle"><ThemeToggle /></div>
				<section className="goal-wizard-shell" aria-labelledby="goal-wizard-title">
					<div className="goal-wizard-main">
						<header className="goal-wizard-header">
							<div className="goal-wizard-header-main">
								<button type="button" className="btn btn-ghost btn-icon goal-wizard-close" onClick={() => navigate(-1)} aria-label="Close task setup">
									<X size={30} />
								</button>
								<div className="goal-wizard-header-copy">
									<h3 id="goal-wizard-title">Loading task setup</h3>
									<p>We are bringing milestone context into view.</p>
								</div>
							</div>
						</header>
						<div className="goal-wizard-body">
							<div className="goal-wizard-loader">
								<div className="goal-wizard-loader-message">
									<span className="spinner-border spinner-border-sm" aria-hidden="true" />
									<span>{loaderMessage}</span>
								</div>
								<div className="goal-wizard-loader-track" aria-hidden="true">
									{GOAL_LOADER_STEPS.map((step, i) => (
										<span key={step} className={`goal-wizard-loader-dot ${i <= loaderIndex ? "is-active" : ""}`.trim()} />
									))}
								</div>
							</div>
						</div>
					</div>
					<StepImageVisual images={LOADER_VISUAL_IMAGES} activeIndex={0} />
				</section>
			</div>
		);
	}

	// ── Main wizard ───────────────────────────────────────────────────────────
	return (
		<div className="goal-wizard-backdrop">
			<div className="goal-wizard-page-theme-toggle"><ThemeToggle /></div>

			<section className="goal-wizard-shell" aria-labelledby="goal-wizard-title">
				<div className="goal-wizard-main">
					<header className="goal-wizard-header">
						<div className="goal-wizard-header-main">
							<button type="button" className="btn btn-ghost btn-icon goal-wizard-close" onClick={() => navigate(-1)} aria-label="Close task setup" disabled={submitting}>
								<X size={30} />
							</button>
							<div className="goal-wizard-header-copy">
								<h3 id="goal-wizard-title">{isEditMode ? "Edit Task" : "Create Task"}</h3>
								{currentSubtitle && <p>{currentSubtitle}</p>}
							</div>
						</div>
					</header>

					<div className="goal-wizard-body">
						<aside className="goal-wizard-stepper" aria-label="Task setup steps">
							{visibleSteps.map((step, index) => {
								const isActive = index === currentStepIndex;
								const isDone = index < currentStepIndex;

								return (
									<div key={step.key} className={`goal-wizard-step-block ${isActive ? "is-active" : ""} ${isDone ? "is-done" : ""}`.trim()}>
										<button
											type="button"
											className={`goal-wizard-step ${isActive ? "is-active" : ""} ${isDone ? "is-done" : ""}`.trim()}
											onClick={() => setCurrentStepIndex(index)}
											disabled={submitting}
										>
											<span className="goal-wizard-step-index">{isDone && !isActive ? "✓" : index + 1}</span>
											<span className="goal-wizard-step-copy">
												<span className="goal-wizard-step-title">{step.title}</span>
											</span>
										</button>

										<div className="goal-wizard-step-expand" aria-hidden={!isActive}>
											<div className="goal-wizard-step-expand-inner">
												<div className="goal-wizard-stage-header">
													{step.header && <h3>{step.header}</h3>}
													{step.subtitle && <p>{step.subtitle}</p>}
												</div>

												{/* ── Step: Define Task ── */}
												{step.key === "defineTask" && (
													<>
														<div className="mt-3">
															<label className="form-label">Title</label>
															<input
																className={`form-control goal-wizard-title-input ${fieldErrors.title ? "is-invalid" : ""}`.trim()}
																value={answers.title}
																autoComplete="off"
																onChange={(e) => updateAnswer("title", e.target.value)}
																placeholder="Example: Solve 200 LeetCode problems"
																disabled={!isActive || submitting}
															/>
														</div>

														<div className="mt-3">
															<label className="form-label">Type</label>
															<div className="goal-task-type-toggle mt-0">
																<button
																	type="button"
																	className={`goal-task-type-option ${answers.taskType === "Binary" ? "is-active" : ""}`.trim()}
																	onClick={() => updateAnswer("taskType", "Binary")}
																	disabled={!isActive || submitting}
																>
																	<span className="goal-task-type-option-title">Complete it</span>
																	<span className="goal-task-type-option-subtitle">Mark the task done when you finish it.</span>
																</button>
																<button
																	type="button"
																	className={`goal-task-type-option ${answers.taskType === "Numeric" ? "is-active" : ""}`.trim()}
																	onClick={() => updateAnswer("taskType", "Numeric")}
																	disabled={!isActive || submitting}
																>
																	<span className="goal-task-type-option-title">Track progress</span>
																	<span className="goal-task-type-option-subtitle">Track progress toward a measurable target.</span>
																</button>
															</div>
														</div>
													</>
												)}

												{/* ── Step: Configure Progress (Numeric only) ── */}
												{step.key === "configureProgress" && (
													<>
														<div className="mt-3">
															<label className="form-label">Target value</label>
															<input
																type="number"
																className={`form-control ${fieldErrors.targetValue ? "is-invalid" : ""}`.trim()}
																value={answers.targetValue}
																onChange={(e) => updateAnswer("targetValue", e.target.value)}
																placeholder="200"
																min={1}
																step="1"
																disabled={!isActive || submitting}
															/>
														</div>
														<div className="mt-3">
															<label className="form-label">Value unit</label>
															<input
																className={`form-control ${fieldErrors.valueUnit ? "is-invalid" : ""}`.trim()}
																value={answers.valueUnit}
																onChange={(e) => updateAnswer("valueUnit", e.target.value)}
																placeholder="Problems, Questions, Chapters"
																disabled={!isActive || submitting}
															/>
														</div>
													</>
												)}

												{/* ── Step: Configure Planning ── */}
												{step.key === "configurePlanning" && (
													<>
														<div className="mt-3">
															<label className="form-label">Add this task to your daily plan?</label>
															<div className="goal-task-type-toggle mt-0">
																<button
																	type="button"
																	className={`goal-task-type-option ${answers.planningEnabled ? "is-active" : ""}`.trim()}
																	onClick={() => updateAnswer("planningEnabled", true)}
																	disabled={!isActive || submitting}
																>
																	<span className="goal-task-type-option-title">Yes</span>
																	<span className="goal-task-type-option-subtitle">Include this task in your daily planner.</span>
																</button>
																<button
																	type="button"
																	className={`goal-task-type-option ${!answers.planningEnabled ? "is-active" : ""}`.trim()}
																	onClick={() => updateAnswer("planningEnabled", false)}
																	disabled={!isActive || submitting}
																>
																	<span className="goal-task-type-option-title">No</span>
																	<span className="goal-task-type-option-subtitle">Manage this task manually.</span>
																</button>
															</div>
														</div>

														{answers.planningEnabled && renderSchedulingSection()}
													</>
												)}

												{/* ── Step: Additional Details ── */}
												{step.key === "additionalDetails" && (
													<>
														{answers.planningEnabled && (
															<>
																{/* Preferred time + specific time */}
																<div className="mb-3">
																	<label className="form-label">Preferred time <span className="text-muted fw-normal">(optional)</span></label>
																	<div className="d-flex gap-2 align-items-center">
																		<select
																			className="form-select"
																			value={answers.preferredTime}
																			onChange={(e) => updateAnswer("preferredTime", e.target.value as TaskPreferredTime)}
																			disabled={!isActive || submitting}
																		>
																			{PREFERRED_TIME_OPTIONS.map((opt) => (
																				<option key={opt.value} value={opt.value}>{opt.label}</option>
																			))}
																		</select>
																		{answers.preferredTime === "custom" && (
																			<div className="d-flex gap-1 align-items-center flex-shrink-0">
																				<select className="form-select habit-time-select" value={parsedSpecificTime.h} onChange={(e) => setSpecificTimePart("h", e.target.value)} disabled={!isActive || submitting} aria-label="Hour">
																					{Array.from({ length: 12 }, (_, i) => String(i + 1)).map((h) => <option key={h} value={h}>{String(Number(h)).padStart(2, "0")}</option>)}
																				</select>
																				:
																				<select className="form-select habit-time-select" value={parsedSpecificTime.m} onChange={(e) => setSpecificTimePart("m", e.target.value)} disabled={!isActive || submitting} aria-label="Minute">
																					{MINUTES.map((m) => <option key={m} value={m}>{m}</option>)}
																				</select>
																				<select className="form-select habit-time-select" value={parsedSpecificTime.a} onChange={(e) => setSpecificTimePart("a", e.target.value)} disabled={!isActive || submitting} aria-label="AM/PM" style={{ minWidth: "3.5rem" }}>
																					<option value="AM">AM</option>
																					<option value="PM">PM</option>
																				</select>
																			</div>
																		)}
																	</div>
																</div>

																{/* Duration */}
																<div className="mb-3">
																	<label className="form-label">How long will it take? <span className="text-muted fw-normal">(minutes, optional)</span></label>
																	<input
																		type="number"
																		className="form-control"
																		value={answers.durationMinutes}
																		onChange={(e) => updateAnswer("durationMinutes", e.target.value)}
																		placeholder="30"
																		min={1}
																		step={1}
																		disabled={!isActive || submitting}
																	/>
																</div>
															</>
														)}

														<div>
															<label className="form-label">Note <span className="text-muted fw-normal">(optional)</span></label>
															<input
																type="text"
																className="form-control"
																value={answers.note}
																autoComplete="off"
																onChange={(event) => updateAnswer("note", event.target.value)}
																placeholder="Any extra details for this task"
																disabled={!isActive || submitting}
															/>
														</div>
													</>
												)}

												{/* ── Step footer ── */}
												<div className="goal-wizard-footer mt-3">
													{index < visibleSteps.length - 1 ? (
														<button
															type="button"
															className="btn btn-brand btn-brand-custom"
															onClick={() => goNextFrom(index)}
															disabled={!isActive || submitting || !canGoNext}
														>
															Next <ArrowRight size={16} className="ms-1" />
														</button>
													) : (
														<button
															type="button"
															className="btn btn-brand btn-brand-custom"
															onClick={() => void handleSubmit()}
															disabled={!isActive || submitting || !canSubmit}
														>
															{submitting ? "Saving…" : isEditMode ? "Save Changes" : "Set Task"}{" "}
															<Check2Circle size={16} className="ms-1" />
														</button>
													)}
													{displayError && (
														<div className="alert alert-danger goal-wizard-inline-error mb-0">{displayError}</div>
													)}
												</div>
											</div>
										</div>
									</div>
								);
							})}
						</aside>
					</div>
				</div>

				<GoalWizardVisual mode="journey" boyStepIndex={currentStepIndex} isBoyVisible />
			</section>
		</div>
	);
}
