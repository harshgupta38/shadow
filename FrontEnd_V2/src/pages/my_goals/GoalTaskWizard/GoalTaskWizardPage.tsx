import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check2Circle, X } from "react-bootstrap-icons";
import { useNavigate, useParams } from "react-router-dom";

import { api, type GoalDetailResponse, type MilestoneResponse, type TaskType } from "@/api";
import { ApiError } from "@/api/client";
import LOADING_IMAGE from "@/assets/loading_default.png";
import { StepImageVisual } from "@/components/ui/StepImageVisual/StepImageVisual";
import { ThemeToggle } from "@/components/ui/ThemeToggle/ThemeToggle";
import { useToast } from "@/context/ToastContext";
import { ROUTES } from "@/routes/RoutePaths";
import { resizeTextareaToMaxLines } from "@/services/textarea-resize.service";

import { GoalWizardVisual } from "@/pages/my_goals/GoalCreationWizard/GoalWizardVisual";
import {
	EMPTY_ANSWERS,
	GOAL_LOADER_STEPS,
	PLANNING_METHODS,
	STEPS,
	type TaskWizardStepKey,
	type TaskWizardAnswers,
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
	| "planningStartDate"
	| "planningEndDate";

type TaskFieldErrors = Partial<Record<TaskFieldErrorKey, string>>;

function parseOptionalNumber(raw: string): number | null {
	const trimmed = raw.trim();
	if (!trimmed) {
		return null;
	}

	const parsed = Number(trimmed);
	if (!Number.isFinite(parsed)) {
		return null;
	}

	return parsed;
}

function parseRequiredPositive(raw: string): number | null {
	const parsed = parseOptionalNumber(raw);
	if (parsed === null || parsed <= 0) {
		return null;
	}

	return parsed;
}

function trimOrNull(raw: string): string | null {
	const trimmed = raw.trim();
	return trimmed ? trimmed : null;
}

function getTodayIsoLocalDate(): string {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function normalizeForType(answers: TaskWizardAnswers): TaskWizardAnswers {
	if (answers.taskType === "Binary") {
		return {
			...answers,
			targetValue: "",
			valueUnit: "",
			planningEnabled: false,
			planningMethod: "Daily",
			plannerTarget: "",
			planningStartDate: "",
			startWithMilestone: false,
			planningEndDate: "",
			endWithMilestone: false,
		};
	}

	return answers;
}

function mapTaskFieldErrors(fieldErrors: Partial<Record<string, string>>): TaskFieldErrors {
	const mapped: TaskFieldErrors = {};

	const aliases: Record<TaskFieldErrorKey, string[]> = {
		title: ["title"],
		taskType: ["task_type"],
		targetValue: ["target_value"],
		valueUnit: ["value_unit"],
		plannerTarget: ["planner_target"],
		planningStartDate: ["planning_start_date"],
		planningEndDate: ["planning_end_date"],
	};

	for (const key of Object.keys(aliases) as TaskFieldErrorKey[]) {
		const match = aliases[key].find((alias) => {
			const message = fieldErrors[alias];
			return typeof message === "string" && message.trim().length > 0;
		});

		if (match) {
			mapped[key] = String(fieldErrors[match]);
		}
	}

	return mapped;
}

function getStepBannerError(stepKey: TaskWizardStepKey, fieldErrors: TaskFieldErrors): string | null {
	if (stepKey === "defineTask") {
		return fieldErrors.title ?? fieldErrors.taskType ?? null;
	}

	if (stepKey === "configureProgress") {
		return fieldErrors.targetValue ?? fieldErrors.valueUnit ?? null;
	}

	if (stepKey === "configurePlanning") {
		return (
			fieldErrors.plannerTarget
			?? fieldErrors.planningStartDate
			?? fieldErrors.planningEndDate
			?? null
		);
	}

	return null;
}

function getStepValidationErrors(stepKey: TaskWizardStepKey, answers: TaskWizardAnswers): TaskFieldErrors {
	const nextErrors: TaskFieldErrors = {};

	if (stepKey === "defineTask") {
		if (!answers.title.trim()) {
			nextErrors.title = "Please provide title.";
		}

		if (answers.taskType !== "Numeric" && answers.taskType !== "Binary") {
			nextErrors.taskType = "Please select a task type.";
		}

		return nextErrors;
	}

	if (stepKey === "configureProgress") {
		const targetValue = parseRequiredPositive(answers.targetValue);
		if (targetValue === null) {
			nextErrors.targetValue = "Target value must be greater than 0.";
		}

		if (!answers.valueUnit.trim()) {
			nextErrors.valueUnit = "Value unit is required for numeric tasks.";
		}

		return nextErrors;
	}

	if (stepKey === "configurePlanning") {
		if (!answers.planningEnabled) {
			return nextErrors;
		}

		if (answers.startWithMilestone && !answers.endWithMilestone) {
			nextErrors.planningEndDate = "When start is tied to milestone, end must also be tied to milestone.";
			return nextErrors;
		}

		const today = getTodayIsoLocalDate();
		const plannerTarget = parseRequiredPositive(answers.plannerTarget);
		if (plannerTarget === null) {
			nextErrors.plannerTarget = "Planner target must be greater than 0.";
		}

		if (!answers.startWithMilestone && !answers.planningStartDate) {
			nextErrors.planningStartDate = "Planning start date is required.";
		}

		if (!answers.startWithMilestone && answers.planningStartDate && answers.planningStartDate < today) {
			nextErrors.planningStartDate = "Planning start date cannot be in the past.";
		}

		if (!answers.endWithMilestone && !answers.planningEndDate) {
			nextErrors.planningEndDate = "Planning end date is required.";
		}

		if (
			!answers.startWithMilestone
			&& !answers.endWithMilestone
			&& answers.planningStartDate
			&& answers.planningEndDate
			&& answers.planningEndDate < answers.planningStartDate
		) {
			nextErrors.planningEndDate = "Planning end date must be on or after planning start date.";
		}

		return nextErrors;
	}

	return nextErrors;
}

export function GoalTaskWizardPage() {
	const { goalId, milestoneId } = useParams();
	const navigate = useNavigate();
	const toast = useToast();

	const [goal, setGoal] = useState<GoalDetailResponse | null>(null);
	const [milestone, setMilestone] = useState<MilestoneResponse | null>(null);
	const [loadingContext, setLoadingContext] = useState(true);
	const [loaderIndex, setLoaderIndex] = useState(0);
	const [currentStepIndex, setCurrentStepIndex] = useState(0);
	const [answers, setAnswers] = useState<TaskWizardAnswers>(EMPTY_ANSWERS);
	const [fieldErrors, setFieldErrors] = useState<TaskFieldErrors>({});
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const noteTextareaRef = useRef<HTMLTextAreaElement | null>(null);

	const numericGoalId = Number(goalId);
	const numericMilestoneId = Number(milestoneId);
	const visibleSteps = useMemo(
		() => (answers.taskType === "Numeric"
			? STEPS
			: STEPS.filter((step) => step.key === "defineTask" || step.key === "additionalDetails")),
		[answers.taskType],
	);

	useEffect(() => {
		setCurrentStepIndex((current) => Math.min(current, visibleSteps.length - 1));
	}, [visibleSteps.length]);

	useEffect(() => {
		if (!Number.isInteger(numericGoalId) || numericGoalId <= 0 || !Number.isInteger(numericMilestoneId) || numericMilestoneId <= 0) {
			toast.error("Milestone not found.");
			navigate(ROUTES.MY_GOALS, { replace: true });
			return;
		}

		setLoadingContext(true);

		void Promise.all([
			api.goals.getDetail(numericGoalId),
			api.milestones.getDetail(numericMilestoneId),
		])
			.then(([goalResponse, milestoneResponse]) => {
				if (milestoneResponse.goal_id !== goalResponse.id) {
					toast.error("Milestone does not belong to this goal.");
					navigate(ROUTES.MY_GOALS, { replace: true });
					return;
				}

				setGoal(goalResponse);
				setMilestone(milestoneResponse);
				setLoadingContext(false);
			})
			.catch((requestError) => {
				if (requestError instanceof ApiError) {
					toast.error(requestError.status === 404 ? "Milestone not found." : requestError.message);
				} else {
					toast.error("Could not load milestone context right now.");
				}
				navigate(ROUTES.MY_GOALS, { replace: true });
			});
	}, [navigate, numericGoalId, numericMilestoneId, toast]);

	useEffect(() => {
		if (!loadingContext) {
			setLoaderIndex(0);
			return;
		}

		const interval = window.setInterval(() => {
			setLoaderIndex((current) => Math.min(current + 1, GOAL_LOADER_STEPS.length - 1));
		}, 1100);

		return () => {
			window.clearInterval(interval);
		};
	}, [loadingContext]);

	function updateAnswer<K extends keyof TaskWizardAnswers>(key: K, value: TaskWizardAnswers[K]) {
		setAnswers((current) => {
			const nextDraft = {
				...current,
				[key]: value,
			};

			if (key === "planningStartDate") {
				nextDraft.planningEndDate = "";
			}

			if (key === "startWithMilestone" && value === true) {
				nextDraft.endWithMilestone = true;
				nextDraft.planningEndDate = "";
			}

			if (key === "endWithMilestone" && value === false && current.startWithMilestone) {
				nextDraft.endWithMilestone = true;
			}

			const next = normalizeForType(nextDraft);
			return next;
		});

		setFieldErrors((current) => {
			if (!(key in current)) {
				return current;
			}

			const next = { ...current };
			delete next[key as TaskFieldErrorKey];
			return next;
		});

		setError(null);
	}

	function validateForSubmit(): TaskFieldErrors {
		const nextErrors: TaskFieldErrors = {};

		for (const step of visibleSteps) {
			const stepErrors = getStepValidationErrors(step.key, answers);
			Object.assign(nextErrors, stepErrors);
		}

		return nextErrors;
	}

	function goNextFrom(stepIndex: number) {
		const step = visibleSteps[stepIndex];
		if (!step) {
			return;
		}

		const nextErrors = getStepValidationErrors(step.key, answers);
		if (Object.keys(nextErrors).length > 0) {
			setFieldErrors((current) => ({ ...current, ...nextErrors }));
			setCurrentStepIndex(stepIndex);
			return;
		}

		setCurrentStepIndex(Math.min(stepIndex + 1, visibleSteps.length - 1));
	}

	async function handleSubmit() {
		const nextErrors = validateForSubmit();
		if (Object.keys(nextErrors).length > 0) {
			setFieldErrors(nextErrors);
			setCurrentStepIndex(1);
			return;
		}

		setSubmitting(true);
		setError(null);
		setFieldErrors({});

		try {
			const taskType: TaskType = answers.taskType;

			await api.tasks.save({
				goal_id: numericGoalId,
				milestone_id: numericMilestoneId,
				title: answers.title.trim(),
				task_type: taskType,
				current_value: taskType === "Numeric" ? 0 : null,
				target_value: taskType === "Numeric" ? parseRequiredPositive(answers.targetValue) : null,
				value_unit: taskType === "Numeric" ? trimOrNull(answers.valueUnit) : null,
				planning_enabled: taskType === "Numeric" ? answers.planningEnabled : false,
				planning_method: taskType === "Numeric" && answers.planningEnabled ? answers.planningMethod : null,
				planner_target: taskType === "Numeric" && answers.planningEnabled ? parseRequiredPositive(answers.plannerTarget) : null,
				planning_start_date: taskType === "Numeric" && answers.planningEnabled && !answers.startWithMilestone ? answers.planningStartDate : null,
				start_with_milestone: taskType === "Numeric" ? answers.planningEnabled && answers.startWithMilestone : false,
				planning_end_date: taskType === "Numeric" && answers.planningEnabled && !answers.endWithMilestone ? answers.planningEndDate : null,
				end_with_milestone: taskType === "Numeric" ? answers.planningEnabled && answers.endWithMilestone : false,
				assistant_context: null,
				note: trimOrNull(answers.note),
			});

			toast.success("Task created successfully.");
			navigate(ROUTES.MY_GOAL_DETAIL.replace(":goalId", String(numericGoalId)));
		} catch (submitError) {
			if (submitError instanceof ApiError) {
				const mapped = mapTaskFieldErrors(submitError.fieldErrors ?? {});
				if (Object.keys(mapped).length > 0) {
					setFieldErrors(mapped);
					setCurrentStepIndex(mapped.title || mapped.taskType ? 0 : 1);
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
		if (!activeStep) {
			return false;
		}

		return Object.keys(getStepValidationErrors(activeStep.key, answers)).length === 0;
	}, [answers, currentStepIndex, visibleSteps]);

	const canSubmit = useMemo(() => {
		return Object.keys(validateForSubmit()).length === 0;
	}, [answers, visibleSteps]);

	const currentSubtitle = goal && milestone
		? `For ${goal.title} -> ${milestone.title}`
		: null;

	const activeStepKey = visibleSteps[currentStepIndex]?.key ?? "defineTask";
	const stepBannerError = getStepBannerError(activeStepKey, fieldErrors);
	const displayError = stepBannerError ?? error;
	const loaderMessage = GOAL_LOADER_STEPS[Math.min(loaderIndex, GOAL_LOADER_STEPS.length - 1)];
	const minPlanningStartDate = getTodayIsoLocalDate();
	const minPlanningEndDate = answers.planningStartDate || minPlanningStartDate;

	useEffect(() => {
		if (noteTextareaRef.current) {
			resizeTextareaToMaxLines(noteTextareaRef.current, 8, 20);
		}
	}, [answers.note]);

	if (loadingContext) {
		return (
			<div className="goal-wizard-backdrop">
				<div className="goal-wizard-page-theme-toggle">
					<ThemeToggle />
				</div>
				<section className="goal-wizard-shell" aria-labelledby="goal-wizard-title">
					<div className="goal-wizard-main">
						<header className="goal-wizard-header">
							<div className="goal-wizard-header-main">
								<button
									type="button"
									className="btn btn-ghost btn-icon goal-wizard-close"
									onClick={() => navigate(-1)}
									aria-label="Close task setup"
								>
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
									{GOAL_LOADER_STEPS.map((loaderStep, loaderStepIndex) => (
										<span
											key={loaderStep}
											className={`goal-wizard-loader-dot ${loaderStepIndex <= loaderIndex ? "is-active" : ""}`.trim()}
										/>
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

	return (
		<div className="goal-wizard-backdrop">
			<div className="goal-wizard-page-theme-toggle">
				<ThemeToggle />
			</div>

			<section className="goal-wizard-shell" aria-labelledby="goal-wizard-title">
				<div className="goal-wizard-main">
					<header className="goal-wizard-header">
						<div className="goal-wizard-header-main">
							<button
								type="button"
								className="btn btn-ghost btn-icon goal-wizard-close"
								onClick={() => navigate(-1)}
								aria-label="Close task setup"
								disabled={submitting}
							>
								<X size={30} />
							</button>
							<div className="goal-wizard-header-copy">
								<h3 id="goal-wizard-title">Create Task</h3>
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
									<div
										key={step.key}
										className={`goal-wizard-step-block ${isActive ? "is-active" : ""} ${isDone ? "is-done" : ""}`.trim()}
									>
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

												{step.key === "defineTask" ? (
													<>
														<div className="mt-3">
															<label className="form-label">Title</label>
															<input
																id={`goal-wizard-${step.key}`}
																className={`form-control goal-wizard-title-input ${fieldErrors.title ? "is-invalid" : ""}`.trim()}
																value={answers.title}
																autoComplete="off"
																onChange={(event) => updateAnswer("title", event.target.value)}
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
												) : step.key === "configureProgress" ? (
													<>
														<div className="mt-3">
															<label className="form-label">Target value</label>
															<input
																type="number"
																className={`form-control ${fieldErrors.targetValue ? "is-invalid" : ""}`.trim()}
																value={answers.targetValue}
																onChange={(event) => updateAnswer("targetValue", event.target.value)}
																placeholder="200"
																min={0.000001}
																step="any"
																disabled={!isActive || submitting}
															/>
														</div>

														<div className="mt-3">
															<label className="form-label">Value unit</label>
															<input
																list="task-unit-suggestions"
																className={`form-control ${fieldErrors.valueUnit ? "is-invalid" : ""}`.trim()}
																value={answers.valueUnit}
																onChange={(event) => updateAnswer("valueUnit", event.target.value)}
																placeholder="Problems, Questions, Chapters"
																disabled={!isActive || submitting}
															/>
														</div>
													</>
												) : step.key === "configurePlanning" ? (
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
																	<span className="goal-task-type-option-subtitle">Exclude this task from your daily planner.</span>
																</button>
															</div>
														</div>

														{answers.planningEnabled && (
															<>
																<div className="row g-3 mt-1">
																	<div className="col-md-6">
																		<label className="form-label">Planner target</label>
																		<input
																			type="number"
																			className={`form-control ${fieldErrors.plannerTarget ? "is-invalid" : ""}`.trim()}
																			value={answers.plannerTarget}
																			onChange={(event) => updateAnswer("plannerTarget", event.target.value)}
																			placeholder="1"
																			min={1}
																			step="any"
																			disabled={!isActive || submitting}
																		/>
																	</div>
																	<div className="col-md-6">
																		<label className="form-label">Planning method</label>
																		<select
																			className="form-select"
																			value={answers.planningMethod}
																			onChange={(event) => updateAnswer("planningMethod", event.target.value as "Daily" | "Weekly" | "Monthly")}
																			disabled={!isActive || submitting}
																		>
																			{PLANNING_METHODS.map((method) => (
																				<option key={method} value={method}>{method}</option>
																			))}
																		</select>
																	</div>
																</div>
																{parseRequiredPositive(answers.plannerTarget) !== null && answers.valueUnit.trim() && answers.planningMethod && (
																	<p className="text-muted small mt-2 mb-0">
																		Plan to complete {answers.plannerTarget} {answers.valueUnit} every
																		{answers.planningMethod === "Daily" ? " day" : answers.planningMethod === "Weekly" ? " week" : " month"}.
																	</p>
																)}

																<div className="row g-3 mt-1">
																	<div className="col-md-6">
																		<label className="form-label mb-2">When should planning start?</label>
																		<div className="input-group">
																			<input
																				type="date"
																				className={`form-control ${fieldErrors.planningStartDate ? "is-invalid" : ""}`.trim()}
																				value={answers.planningStartDate}
																				onChange={(event) => updateAnswer("planningStartDate", event.target.value)}
																				min={minPlanningStartDate}
																				disabled={!isActive || submitting || answers.startWithMilestone}
																			/>
																			{answers.planningStartDate ? (
																				<button
																					type="button"
																					className="btn btn-outline-secondary"
																					onClick={() => updateAnswer("planningStartDate", "")}
																					disabled={!isActive || submitting || answers.startWithMilestone}
																					aria-label="Clear planning start date"
																					title="Clear date"
																				>
																					<X size={24} />
																				</button>
																			) : null}
																		</div>
																		<div className="form-check form-switch mt-2">
																			<input
																				id="planning-start-with-milestone"
																				type="checkbox"
																				className="form-check-input"
																				checked={answers.startWithMilestone}
																				onChange={() => {
																					const nextValue = !answers.startWithMilestone;
																					updateAnswer("startWithMilestone", nextValue);
																					if (nextValue) {
																						updateAnswer("planningStartDate", "");
																					}
																				}}
																				disabled={!isActive || submitting}
																			/>
																			<label className="form-check-label small" htmlFor="planning-start-with-milestone">
																				Starts with milestone
																			</label>
																		</div>
																	</div>
																	{(answers.planningStartDate || answers.startWithMilestone) && (
																		<div className="col-md-6">
																			<label className="form-label mb-2">When should planning end?</label>
																			<div className="input-group">
																				<input
																					type="date"
																					className={`form-control ${fieldErrors.planningEndDate ? "is-invalid" : ""}`.trim()}
																					value={answers.planningEndDate}
																					onChange={(event) => updateAnswer("planningEndDate", event.target.value)}
																					min={minPlanningEndDate}
																					disabled={!isActive || submitting || answers.endWithMilestone}
																				/>
																				{answers.planningEndDate ? (
																					<button
																						type="button"
																						className="btn btn-outline-secondary"
																						onClick={() => updateAnswer("planningEndDate", "")}
																						disabled={!isActive || submitting || answers.endWithMilestone}
																						aria-label="Clear planning end date"
																						title="Clear date"
																					>
																						<X size={24} />
																					</button>
																				) : null}
																			</div>
																			<div className="form-check form-switch mt-2">
																				<input
																					id="planning-end-with-milestone"
																					type="checkbox"
																					className="form-check-input"
																					checked={answers.endWithMilestone}
																					onChange={() => {
																						const nextValue = !answers.endWithMilestone;
																						updateAnswer("endWithMilestone", nextValue);
																						if (nextValue) {
																							updateAnswer("planningEndDate", "");
																						}
																					}}
																					disabled={!isActive || submitting || answers.startWithMilestone}
																				/>
																				<label className="form-check-label small" htmlFor="planning-end-with-milestone">
																					Ends with milestone
																				</label>
																			</div>
																		</div>
																	)}
																</div>
															</>
														)}
													</>
												) : (
													<>
														<div className="mt-3">
															<label className="form-label">Note (optional)</label>
															<textarea
																ref={noteTextareaRef}
																className="form-control"
																value={answers.note}
																onChange={(event) => updateAnswer("note", event.target.value)}
																onInput={(event) => resizeTextareaToMaxLines(event.currentTarget, 8, 20)}
																placeholder="Any extra details for this task"
																disabled={!isActive || submitting}
																rows={1}
																style={{ resize: "none", overflowY: "hidden" }}
															/>
														</div>
													</>
												)}

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
															{submitting ? "Saving..." : "Set Task"} <Check2Circle size={16} className="ms-1" />
														</button>
													)}

													{displayError ? <div className="alert alert-danger goal-wizard-inline-error mb-0">{displayError}</div> : null}
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
