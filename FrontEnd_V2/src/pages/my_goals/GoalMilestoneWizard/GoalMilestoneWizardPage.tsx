import { useEffect, useState } from "react";
import { ArrowRight, Check2Circle, X } from "react-bootstrap-icons";
import { useNavigate, useParams } from "react-router-dom";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";

import { api, type GoalDetailResponse } from "@/api";
import { ApiError } from "@/api/client";
import LOADING_IMAGE from "@/assets/loading_default.png";
import { StepImageVisual } from "@/components/ui/StepImageVisual/StepImageVisual";
import { ThemeToggle } from "@/components/ui/ThemeToggle/ThemeToggle";
import { useToast } from "@/context/ToastContext";
import { ROUTES } from "@/routes/RoutePaths";

import { GoalWizardVisual } from "@/pages/my_goals/GoalCreationWizard/GoalWizardVisual";
import {
	EMPTY_ANSWERS,
	GOAL_LOADER_STEPS,
	MAX_ANSWER_LINES,
	STEPS,
	type MilestoneWizardAnswers,
	type MilestoneWizardStepKey,
} from "@/pages/my_goals/GoalMilestoneWizard/GoalMilestoneWizard.constants";

import "@/pages/my_goals/GoalCreationWizard/GoalCreationWizard.scss";
import "@/pages/my_goals/GoalMilestoneWizard/GoalMilestoneWizardPage.scss";

const QUILL_MODULES = {
	toolbar: [
		[{ header: [2, 3, 4, false] }],
		["bold", "italic", "underline"], 
		[{ color: [] }, { background: [] }],
		[{ list: "ordered" }, { list: "bullet" }],
		["blockquote", "code-block"],
		["link"],
		["clean"],
	],
};

const QUILL_FORMATS = [
	"header",
	"bold",
	"italic",
	"underline",
	"color",
	"background",
	"list",
	"bullet",
	"blockquote",
	"code-block",
	"link",
	"clean"
];

function normaliseDescriptionHtml(value: string): string {
	const trimmed = value.trim();
	return trimmed === "" || trimmed === "<p><br></p>" ? "" : trimmed;
}

function parsePositiveDays(value: string): number | null {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0)
		return null;

	return Math.floor(parsed);
}

const LOADER_VISUAL_IMAGES = [LOADING_IMAGE];

type MilestoneFieldErrorKey = "title" | "description" | "reason" | "durationDays";
type MilestoneFieldErrors = Partial<Record<MilestoneFieldErrorKey, string>>;

const MILESTONE_FIELD_KEYS: MilestoneFieldErrorKey[] = ["title", "description", "reason", "durationDays"];

function getStepBannerError(stepIndex: number, fieldErrors: MilestoneFieldErrors): string | null {
	if (stepIndex === 0)
		return fieldErrors.title ?? fieldErrors.description ?? null;
	if (stepIndex === 1)
		return fieldErrors.reason ?? fieldErrors.durationDays ?? null;
	return null;
}

function mapFieldErrorsToMilestoneErrors(fieldErrors: Partial<Record<string, string>>): MilestoneFieldErrors {
	const milestoneFieldErrors: MilestoneFieldErrors = {};

	for (const key of MILESTONE_FIELD_KEYS) {
		const message = fieldErrors[key];
		if (typeof message === "string" && message.trim().length > 0) {
			milestoneFieldErrors[key] = message;
		}
	}

	return milestoneFieldErrors;
}

export function GoalMilestoneWizardPage() {
	const { goalId } = useParams();
	const navigate = useNavigate();
	const toast = useToast();
	const [goal, setGoal] = useState<GoalDetailResponse | null>(null);
	const [loadingGoal, setLoadingGoal] = useState(true);
	const [loaderIndex, setLoaderIndex] = useState(0);
	const [currentStepIndex, setCurrentStepIndex] = useState(0);
	const [answers, setAnswers] = useState<MilestoneWizardAnswers>(EMPTY_ANSWERS);
	const [fieldErrors, setFieldErrors] = useState<Partial<Record<MilestoneFieldErrorKey, string>>>({});
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const numericGoalId = Number(goalId);
	const currentStep = STEPS[currentStepIndex];
	const currentSubtitle = goal ? `For ${goal.title}` : null;
	const loaderMessage = GOAL_LOADER_STEPS[Math.min(loaderIndex, GOAL_LOADER_STEPS.length - 1)];

	function navigateToMyGoalsWithError(message: string) {
		toast.error(message);
		navigate(ROUTES.MY_GOALS, { replace: true });
	}

	useEffect(() => {
		if (!Number.isInteger(numericGoalId) || numericGoalId <= 0) {
			navigateToMyGoalsWithError("Goal not found.");
			return;
		}

		setLoadingGoal(true);

		void api.goals.getDetail(numericGoalId)
			.then((response) => {
				if (!response) {
					navigateToMyGoalsWithError("Goal not found.");
					return;
				}
				setGoal(response);
				setLoadingGoal(false);
			})
			.catch((requestError) => {
				if (requestError instanceof ApiError) {
					navigateToMyGoalsWithError(
						requestError.status === 404 ? "Goal not found." : requestError.message,
					);
				} else {
					navigateToMyGoalsWithError("Could not load this goal right now.");
				}
			});
	}, [navigate, numericGoalId, toast]);

	useEffect(() => {
		if (!loadingGoal) {
			setLoaderIndex(0);
			return;
		}

		const interval = window.setInterval(() => {
			setLoaderIndex((current) => Math.min(current + 1, GOAL_LOADER_STEPS.length - 1));
		}, 1100);

		return () => {
			window.clearInterval(interval);
		};
	}, [loadingGoal]);

	useEffect(() => {
		if (Object.keys(fieldErrors).length === 0)
			return;

		const stepBannerError = getStepBannerError(currentStepIndex, fieldErrors);
		if (stepBannerError)
			setError(null);

	}, [currentStepIndex, fieldErrors]);

	function resizeAnswerTextarea(textarea: HTMLTextAreaElement) {
		const computedStyle = window.getComputedStyle(textarea);
		const lineHeight = Number.parseFloat(computedStyle.lineHeight) || 24;
		const verticalPadding = Number.parseFloat(computedStyle.paddingTop) + Number.parseFloat(computedStyle.paddingBottom);
		const verticalBorder = Number.parseFloat(computedStyle.borderTopWidth) + Number.parseFloat(computedStyle.borderBottomWidth);
		const maxHeight = (lineHeight * MAX_ANSWER_LINES) + verticalPadding + verticalBorder;

		textarea.style.height = "auto";
		const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
		textarea.style.height = `${nextHeight}px`;
		textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
	}

	function updateAnswer(stepKey: MilestoneWizardStepKey, value: string) {
		setAnswers((current) => ({
			...current,
			[stepKey]: value,
		}));
		setFieldErrors((current) => {
			if (!current[stepKey]) {
				return current;
			}

			const next = { ...current };
			delete next[stepKey];
			return next;
		});

		setError(null);
	}

	function goNextFrom(stepIndex: number) {
		const stepKey = STEPS[stepIndex].key;
		if (stepKey === "title") {
			if (!answers.title.trim()) {
				setFieldErrors((current) => ({ ...current, title: "Please provide title." }));
				setCurrentStepIndex(stepIndex);
				return;
			}
		}

		const hasDurationValue = answers.durationDays.trim().length > 0;
		if (stepKey === "reason" && (!answers.reason.trim() || (hasDurationValue && parsePositiveDays(answers.durationDays) === null))) {
			const reasonMessage = !answers.reason.trim() ? "Please explain why this milestone matters." : undefined;
			const durationDaysMessage = hasDurationValue && parsePositiveDays(answers.durationDays) === null ? "Please enter a valid duration in days." : undefined;

			setFieldErrors((current) => ({
				...current,
				reason: reasonMessage,
				durationDays: durationDaysMessage,
			}));
			setCurrentStepIndex(stepIndex);
			return;
		}

		setCurrentStepIndex(Math.min(stepIndex + 1, STEPS.length - 1));
	}

	async function handleSubmit() {
		const titleValue = answers.title.trim();
		const descriptionValue = normaliseDescriptionHtml(answers.description);
		const reasonValue = answers.reason.trim();
		const hasDurationValue = answers.durationDays.trim().length > 0;
		const parsedDays = parsePositiveDays(answers.durationDays);

		if (!titleValue) {
			setCurrentStepIndex(0);
			setFieldErrors((current) => ({ ...current, title: "Please provide title." }));
			return;
		}

		if (!reasonValue || (hasDurationValue && (parsedDays === null || parsedDays <= 0))) {
			setCurrentStepIndex(1);
			const reasonMessage = !reasonValue ? "Please explain why this milestone matters." : undefined;
			const durationDaysMessage = hasDurationValue && (parsedDays === null || parsedDays <= 0) ? "Estimated days should be greater than 0" : undefined;

			setFieldErrors((current) => ({
				...current,
				reason: reasonMessage,
				durationDays: durationDaysMessage,
			}));
			return;
		}

		setSubmitting(true);
		setError(null);
		setFieldErrors({});

		try {
			await api.milestones.create({
				goal_id: numericGoalId,
				title: titleValue,
				description: descriptionValue,
				reason: reasonValue,
				estimated_duration_days: hasDurationValue ? parsedDays : null,
				created_by: "User",
				assistant_context: null,
			});

			toast.success("Milestone created successfully.");
			navigate(ROUTES.MY_GOAL_DETAIL.replace(":goalId", String(numericGoalId)));
		} catch (submitError) {
			if (submitError instanceof ApiError) {
				const mappedFieldErrors = mapFieldErrorsToMilestoneErrors({
					...(submitError.fieldErrors ?? {}),
					durationDays: submitError.fieldErrors?.estimated_duration_days,
				});

				setFieldErrors(mappedFieldErrors);

				if (mappedFieldErrors.title || mappedFieldErrors.description) {
					setCurrentStepIndex(0);
					setError(null);
				} else if (mappedFieldErrors.reason || mappedFieldErrors.durationDays) {
					setCurrentStepIndex(1);
					setError(null);
				} else {
					setError(submitError.message || "Could not save milestone right now.");
				}
			} else {
				setError("Could not save milestone right now.");
			}
		} finally {
			setSubmitting(false);
		}
	}

	const canGoNext =
		(currentStep.key === "title" && answers.title.trim().length > 0)
		|| (currentStep.key === "reason" && answers.reason.trim().length > 0 && (answers.durationDays.trim().length === 0 || parsePositiveDays(answers.durationDays) !== null));
	const canSubmit =
		answers.title.trim().length > 0
		&& answers.reason.trim().length > 0
		&& (answers.durationDays.trim().length === 0 || parsePositiveDays(answers.durationDays) !== null);
	const stepBannerError = getStepBannerError(currentStepIndex, fieldErrors);
	const displayError = stepBannerError ?? error;

	if (loadingGoal) {
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
									aria-label="Close milestone setup"
								>
									<X size={30} />
								</button>
								<div className="goal-wizard-header-copy">
									<h3 id="goal-wizard-title">Loading milestone setup</h3>
									<p>We are bringing the parent goal into view.</p>
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
					{/* TODO MAKE REUSABLE COMPONENT */}
					<header className="goal-wizard-header">
						<div className="goal-wizard-header-main">
							<button
								type="button"
								className="btn btn-ghost btn-icon goal-wizard-close"
								onClick={() => navigate(-1)}
								aria-label="Close milestone setup"
								disabled={submitting}
							>
								<X size={30} />
							</button>
							<div className="goal-wizard-header-copy">
								<h3 id="goal-wizard-title">Set Milestone</h3>
								{currentSubtitle && <p>{currentSubtitle}</p>}
							</div>
						</div>
					</header>

					<div className="goal-wizard-body">
						<aside className="goal-wizard-stepper" aria-label="Milestone setup steps">
							{STEPS.map((step, index) => {
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
													<h3>{step.question}</h3>
													<p>{step.helper}</p>
												</div>

												{index === 0 ? (
													<>
														<div className="mt-3">
															<label className="form-label">Title</label>
															<input
																id={`goal-wizard-${step.key}`}
																className={`form-control goal-wizard-title-input ${fieldErrors.title ? "is-invalid" : ""}`.trim()}
																placeholder={step.placeholder}
																value={answers.title}
																autoComplete="off"
																onChange={(event) => updateAnswer("title", event.target.value)}
																disabled={!isActive || submitting}
															/>
														</div>

														<div className="mt-3">
															<label className="form-label">Description (optional)</label>
															<ReactQuill
																className={`goal-wizard-rich-editor ${fieldErrors.description ? "is-invalid" : ""}`.trim()}
																theme="snow"
																value={answers.description}
																onChange={(value) => updateAnswer("description", value)}
																modules={QUILL_MODULES}
																formats={QUILL_FORMATS}
																readOnly={!isActive || submitting}
																placeholder="Add a brief description of this milestone..."
															/>
														</div>
													</>
												) : (
													<>
														<div className="mt-3">
															<label className="form-label">Why does this step matter?</label>
															<textarea
																id={`goal-wizard-${step.key}`}
																className={`form-control goal-wizard-reason ${fieldErrors.reason ? "is-invalid" : ""}`.trim()}
																placeholder={step.placeholder}
																value={answers.reason}
																autoComplete="off"
																onChange={(event) => {
																	updateAnswer("reason", event.target.value);
																	resizeAnswerTextarea(event.currentTarget);
																}}
																disabled={!isActive || submitting}
															/>
														</div>

														<div className="mt-3">
															<label className="form-label">Estimated duration in days (optional)</label>
															<input
																type="number"
																className={`form-control goal-wizard-days-input ${fieldErrors.durationDays ? "is-invalid" : ""}`.trim()}
																value={answers.durationDays}
																autoComplete="off"
																onChange={(event) => updateAnswer("durationDays", event.target.value)}
																placeholder="Example: 14"
																min={1}
																step={1}
																disabled={!isActive || submitting}
															/>
														</div>
													</>
												)}

												<div className="goal-wizard-footer mt-3">
													{index < STEPS.length - 1 ? (
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
															{submitting ? "Saving..." : "Set Milestone"} <Check2Circle size={16} className="ms-1" />
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