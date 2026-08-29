import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check2Circle, X } from "react-bootstrap-icons";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { api, type ScheduledTaskDataResponse } from "@/api";
import { ApiError } from "@/api/client";
import LOADING_IMAGE from "@/assets/loading_default.png";
import { StepImageVisual } from "@/components/ui/StepImageVisual/StepImageVisual";
import { ThemeToggle } from "@/components/ui/ThemeToggle/ThemeToggle";
import { useToast } from "@/context/ToastContext";
import { GoalWizardVisual } from "@/pages/my_goals/GoalCreationWizard/GoalWizardVisual";
import { ROUTES } from "@/routes/RoutePaths";

import {
    answersFromTask,
    buildTime,
    getStepBannerError,
    getStepValidationErrors,
    makeEmptyAnswers,
    mapApiFieldErrors,
    MINUTES,
    parseOptionalPositiveInt,
    parseTime,
    PREFERRED_TIME_OPTIONS,
    PRIORITY_OPTIONS,
    SCHEDULE_LOADER_STEPS,
    STEPS,
    type ScheduleFieldErrorKey,
    type ScheduleFieldErrors,
    type ScheduleWizardAnswers,
} from "@/pages/schedule/ScheduleWizard/ScheduleWizard.constants";

import { resizeTextareaToMaxLines } from "@/services/textarea-resize.service";

import "@/pages/my_goals/GoalCreationWizard/GoalCreationWizard.scss";
import "@/pages/my_goals/GoalMilestoneWizard/GoalMilestoneWizardPage.scss";
import "@/pages/my_goals/GoalTaskWizard/GoalTaskWizardPage.scss";
import "@/pages/schedule/ScheduleWizard/ScheduleWizardPage.scss";

const LOADER_VISUAL_IMAGES = [LOADING_IMAGE];

// ── Component ──────────────────────────────────────────────────────────────────

export function ScheduleWizardPage() {
    const { taskId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const toast = useToast();

    const isEditMode = Boolean(taskId);
    const numericTaskId = Number(taskId);

    const stateTask  = (location.state as { task?:  ScheduledTaskDataResponse } | null)?.task  ?? null;
    const stateDraft = (location.state as { draft?: ScheduledTaskDataResponse } | null)?.draft ?? null;

    const [loadingContext, setLoadingContext] = useState(isEditMode && !stateTask);
    const [loaderIndex, setLoaderIndex] = useState(0);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [answers, setAnswers] = useState<ScheduleWizardAnswers>(() => {
        if (isEditMode && stateTask) return answersFromTask(stateTask);
        if (!isEditMode && stateDraft) {
            // Duplicate: pre-fill all fields but reset the date so user picks a new one
            return { ...answersFromTask(stateDraft), scheduledDate: "" };
        }
        return makeEmptyAnswers();
    });
    const [fieldErrors, setFieldErrors] = useState<ScheduleFieldErrors>({});
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const dateInputRef = useRef<HTMLInputElement>(null);
    const noteRef = useRef<HTMLTextAreaElement>(null);

    // ── Load context (edit mode fallback) ─────────────────────────────────────
    useEffect(() => {
        if (!isEditMode || stateTask) return;

        if (!Number.isInteger(numericTaskId) || numericTaskId <= 0) {
            toast.error("Task not found.");
            navigate(ROUTES.SCHEDULE, { replace: true });
            return;
        }

        setLoadingContext(true);
        void api.schedule.getScheduleList()
            .then((list) => {
                const found = list.find((t) => t.id === numericTaskId);
                if (!found) {
                    toast.error("Task not found.");
                    navigate(ROUTES.SCHEDULE, { replace: true });
                    return;
                }
                setAnswers(answersFromTask(found));
                setLoadingContext(false);
            })
            .catch((err) => {
                toast.error(err instanceof ApiError ? err.message : "Could not load task.");
                navigate(ROUTES.SCHEDULE, { replace: true });
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (noteRef.current) resizeTextareaToMaxLines(noteRef.current, 5);
    }, [answers.note]);

    useEffect(() => {
        if (!loadingContext) { setLoaderIndex(0); return; }
        const interval = window.setInterval(() => {
            setLoaderIndex((cur) => Math.min(cur + 1, SCHEDULE_LOADER_STEPS.length - 1));
        }, 1100);
        return () => window.clearInterval(interval);
    }, [loadingContext]);

    // ── Answer helpers ─────────────────────────────────────────────────────────
    function updateAnswer<K extends keyof ScheduleWizardAnswers>(key: K, value: ScheduleWizardAnswers[K]) {
        setAnswers((cur) => ({ ...cur, [key]: value }));
        setFieldErrors((cur) => {
            if (!(key in cur)) return cur;
            const next = { ...cur };
            delete next[key as ScheduleFieldErrorKey];
            return next;
        });
        setError(null);
    }

    // ── Specific time picker ────────────────────────────────────────────────────
    const parsedSpecificTime = useMemo(() => parseTime(answers.specificTime), [answers.specificTime]);

    function setSpecificTimePart(part: "h" | "m" | "a", val: string) {
        const p = { ...parsedSpecificTime, [part]: val };
        updateAnswer("specificTime", buildTime(p.h, p.m, p.a));
    }

    // ── Validation ──────────────────────────────────────────────────────────────
    function validateForSubmit(): ScheduleFieldErrors {
        const errs: ScheduleFieldErrors = {};
        for (const step of STEPS) Object.assign(errs, getStepValidationErrors(step.key, answers));
        return errs;
    }

    function goNextFrom(stepIndex: number) {
        const step = STEPS[stepIndex];
        if (!step) return;
        const nextErrors = getStepValidationErrors(step.key, answers);
        if (Object.keys(nextErrors).length > 0) {
            setFieldErrors((cur) => ({ ...cur, ...nextErrors }));
            setCurrentStepIndex(stepIndex);
            return;
        }
        setCurrentStepIndex(Math.min(stepIndex + 1, STEPS.length - 1));
    }

    // ── Submit ──────────────────────────────────────────────────────────────────
    async function handleSubmit() {
        const nextErrors = validateForSubmit();
        if (Object.keys(nextErrors).length > 0) {
            setFieldErrors(nextErrors);
            const errorStepIndex = STEPS.findIndex(
                (step) => getStepBannerError(step.key, nextErrors) !== null,
            );
            setCurrentStepIndex(errorStepIndex >= 0 ? errorStepIndex : 0);
            return;
        }

        setSubmitting(true);
        setError(null);
        setFieldErrors({});

        try {
            const isMetric = answers.plannerType === "metric";
            const specificTimeOut = answers.preferredTime === "custom"
                ? buildTime(parsedSpecificTime.h, parsedSpecificTime.m, parsedSpecificTime.a)
                : "";

            const payload = {
                title: answers.title.trim(),
                planner_type: answers.plannerType,
                planner_target: isMetric ? parseOptionalPositiveInt(answers.plannerTarget) : null,
                value_unit: isMetric ? (answers.valueUnit.trim() || null) : null,
                priority: answers.priority,
                scheduled_date: answers.scheduledDate,
                preferred_time: answers.preferredTime,
                specific_time: specificTimeOut || null,
                allow_snoozing: answers.allowSnoozing,
                snooze_limit: answers.allowSnoozing
                    ? (answers.snoozeLimit ? parseOptionalPositiveInt(answers.snoozeLimit) : null)
                    : null,
                duration_minutes: parseOptionalPositiveInt(answers.durationMinutes),
                note: answers.note.trim() || null,
            };

            if (isEditMode) {
                await api.schedule.updateScheduleTask(numericTaskId, payload);
                toast.success("Task updated successfully.");
            } else {
                await api.schedule.save(payload);
                toast.success("Task scheduled successfully.");
            }

            navigate(ROUTES.SCHEDULE);
        } catch (submitError) {
            if (submitError instanceof ApiError) {
                const mapped = mapApiFieldErrors(submitError.fieldErrors ?? {});
                if (Object.keys(mapped).length > 0) {
                    setFieldErrors(mapped);
                    const errorStepIndex = STEPS.findIndex(
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
        const activeStep = STEPS[currentStepIndex];
        if (!activeStep) return false;
        return Object.keys(getStepValidationErrors(activeStep.key, answers)).length === 0;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [answers, currentStepIndex]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const canSubmit = useMemo(() => Object.keys(validateForSubmit()).length === 0, [answers]);

    const activeStepKey = STEPS[currentStepIndex]?.key ?? "defineTask";
    const stepBannerError = getStepBannerError(activeStepKey, fieldErrors);
    const displayError = stepBannerError ?? error;
    const loaderMessage = SCHEDULE_LOADER_STEPS[Math.min(loaderIndex, SCHEDULE_LOADER_STEPS.length - 1)];

    // ── Loading state ──────────────────────────────────────────────────────────
    if (loadingContext) {
        return (
            <div className="goal-wizard-backdrop">
                <div className="goal-wizard-page-theme-toggle"><ThemeToggle /></div>
                <section className="goal-wizard-shell" aria-labelledby="schedule-wizard-title">
                    <div className="goal-wizard-main">
                        <header className="goal-wizard-header">
                            <div className="goal-wizard-header-main">
                                <button type="button" className="btn btn-ghost btn-icon goal-wizard-close" onClick={() => navigate(-1)} aria-label="Close">
                                    <X size={30} />
                                </button>
                                <div className="goal-wizard-header-copy">
                                    <h3 id="schedule-wizard-title">Loading task</h3>
                                    <p>We are bringing your task details into view.</p>
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
                                    {SCHEDULE_LOADER_STEPS.map((step, i) => (
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

    // ── Main wizard ────────────────────────────────────────────────────────────
    return (
        <div className="goal-wizard-backdrop">
            <div className="goal-wizard-page-theme-toggle"><ThemeToggle /></div>

            <section className="goal-wizard-shell" aria-labelledby="schedule-wizard-title">
                <div className="goal-wizard-main">
                    <header className="goal-wizard-header">
                        <div className="goal-wizard-header-main">
                            <button
                                type="button"
                                className="btn btn-ghost btn-icon goal-wizard-close"
                                onClick={() => navigate(ROUTES.SCHEDULE)}
                                aria-label="Close schedule task setup"
                                disabled={submitting}
                            >
                                <X size={30} />
                            </button>
                            <div className="goal-wizard-header-copy">
                                <h3 id="schedule-wizard-title">{isEditMode ? "Edit Task" : "Schedule Task"}</h3>
                            </div>
                        </div>
                    </header>

                    <div className="goal-wizard-body">
                        <aside className="goal-wizard-stepper" aria-label="Schedule task setup steps">
                            {STEPS.map((step, index) => {
                                const isActive = index === currentStepIndex;
                                const isDone = index < currentStepIndex;
                                const isMetric = answers.plannerType === "metric";

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

                                                {/* ── Step 1: Define Task ── */}
                                                {step.key === "defineTask" && (
                                                    <>
                                                        <div className="mt-3">
                                                            <label className="form-label">Title</label>
                                                            <input
                                                                className={`form-control goal-wizard-title-input ${fieldErrors.title ? "is-invalid" : ""}`.trim()}
                                                                value={answers.title}
                                                                autoComplete="off"
                                                                onChange={(e) => updateAnswer("title", e.target.value)}
                                                                placeholder="e.g. Visit dentist, Call mom"
                                                                disabled={!isActive || submitting}
                                                            />
                                                            {fieldErrors.title && (
                                                                <div className="text-danger small mt-1">{fieldErrors.title}</div>
                                                            )}
                                                        </div>

                                                        <div className="mt-3">
                                                            <label className="form-label">Type</label>
                                                            <div className="goal-task-type-toggle mt-0">
                                                                <button
                                                                    type="button"
                                                                    className={`goal-task-type-option ${answers.plannerType === "simple" ? "is-active" : ""}`.trim()}
                                                                    onClick={() => updateAnswer("plannerType", "simple")}
                                                                    disabled={!isActive || submitting}
                                                                >
                                                                    <span className="goal-task-type-option-title">Simple</span>
                                                                    <span className="goal-task-type-option-subtitle">Mark the task done when complete.</span>
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className={`goal-task-type-option ${answers.plannerType === "metric" ? "is-active" : ""}`.trim()}
                                                                    onClick={() => updateAnswer("plannerType", "metric")}
                                                                    disabled={!isActive || submitting}
                                                                >
                                                                    <span className="goal-task-type-option-title">Metric</span>
                                                                    <span className="goal-task-type-option-subtitle">Track progress toward a measurable target.</span>
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <p className="text-muted small mt-2">
                                                            {answers.plannerType === "metric"
                                                                ? "Metric tasks like 'Drink 8 glasses of water' let you track progress toward a measurable target."
                                                                : "Simple tasks like 'Visit dentist' are marked done in one step."}
                                                        </p>
                                                    </>
                                                )}

                                                {/* ── Step 2: When & Priority ── */}
                                                {step.key === "whenAndPriority" && (
                                                    <div className="mt-3">
                                                        {/* Metric fields */}
                                                        {isMetric && (
                                                            <div className="row g-3 mb-3">
                                                                <div className="col-md-6">
                                                                    <label className="form-label">
                                                                        How many {answers.valueUnit ? <strong>{answers.valueUnit}</strong> : "units"}?
                                                                    </label>
                                                                    <input
                                                                        type="number"
                                                                        className={`form-control ${fieldErrors.plannerTarget ? "is-invalid" : ""}`.trim()}
                                                                        value={answers.plannerTarget}
                                                                        onChange={(e) => updateAnswer("plannerTarget", e.target.value)}
                                                                        placeholder="e.g. 8"
                                                                        min={1}
                                                                        step={1}
                                                                        disabled={!isActive || submitting}
                                                                    />
                                                                    {fieldErrors.plannerTarget && (
                                                                        <div className="text-danger small mt-1">{fieldErrors.plannerTarget}</div>
                                                                    )}
                                                                </div>
                                                                <div className="col-md-6">
                                                                    <label className="form-label">Value Unit</label>
                                                                    <input
                                                                        className={`form-control ${fieldErrors.valueUnit ? "is-invalid" : ""}`.trim()}
                                                                        value={answers.valueUnit}
                                                                        onChange={(e) => updateAnswer("valueUnit", e.target.value.trim())}
                                                                        placeholder="e.g. glasses, km, reps"
                                                                        disabled={!isActive || submitting}
                                                                    />
                                                                    {fieldErrors.valueUnit && (
                                                                        <div className="text-danger small mt-1">{fieldErrors.valueUnit}</div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Priority + Scheduled date — side-by-side on md+ */}
                                                        <div className="row g-3 mb-3">
                                                            <div className="col-md-6">
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
                                                            <div className="col-md-6">
                                                                <label className="form-label">Scheduled date</label>
                                                                <div
                                                                    className={`form-control schedule-date-display ${fieldErrors.scheduledDate ? "is-invalid" : ""} ${!isActive || submitting ? "disabled" : ""}`.trim()}
                                                                    onClick={() => { if (isActive && !submitting) dateInputRef.current?.showPicker(); }}
                                                                    onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && isActive && !submitting) dateInputRef.current?.showPicker(); }}
                                                                    role="button"
                                                                    tabIndex={isActive && !submitting ? 0 : -1}
                                                                    aria-label="Open date picker"
                                                                >
                                                                    {answers.scheduledDate
                                                                        ? new Date(answers.scheduledDate + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })
                                                                        : <span className="schedule-date-placeholder">Pick a date</span>
                                                                    }
                                                                    <input
                                                                        ref={dateInputRef}
                                                                        type="date"
                                                                        value={answers.scheduledDate}
                                                                        onChange={(e) => updateAnswer("scheduledDate", e.target.value)}
                                                                        disabled={!isActive || submitting}
                                                                        className="schedule-date-hidden-input"
                                                                        tabIndex={-1}
                                                                        aria-hidden="true"
                                                                    />
                                                                </div>
                                                                {fieldErrors.scheduledDate && (
                                                                    <div className="text-danger small mt-1">{fieldErrors.scheduledDate}</div>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Preferred time */}
                                                        <div className="mb-3">
                                                            <label className="form-label">
                                                                Preferred time <span className="text-muted fw-normal">(optional)</span>
                                                            </label>
                                                            <div className="d-flex gap-2 align-items-center">
                                                                <select
                                                                    className="form-select"
                                                                    value={answers.preferredTime}
                                                                    onChange={(e) => {
                                                                        updateAnswer("preferredTime", e.target.value as typeof answers.preferredTime);
                                                                        if (e.target.value !== "custom") updateAnswer("specificTime", "");
                                                                    }}
                                                                    disabled={!isActive || submitting}
                                                                >
                                                                    {PREFERRED_TIME_OPTIONS.map((opt) => (
                                                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                                    ))}
                                                                </select>
                                                                {answers.preferredTime === "custom" && (
                                                                    <div className="d-flex gap-1 align-items-center flex-shrink-0">
                                                                        <select className="form-select schedule-time-select" value={parsedSpecificTime.h} onChange={(e) => setSpecificTimePart("h", e.target.value)} disabled={!isActive || submitting} aria-label="Hour">
                                                                            {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((h) => <option key={h} value={h}>{String(Number(h)).padStart(2, "0")}</option>)}
                                                                        </select>
                                                                        :
                                                                        <select className="form-select schedule-time-select" value={parsedSpecificTime.m} onChange={(e) => setSpecificTimePart("m", e.target.value)} disabled={!isActive || submitting} aria-label="Minute">
                                                                            {MINUTES.map((m) => <option key={m} value={m}>{m}</option>)}
                                                                        </select>
                                                                        <select className="form-select schedule-time-select" value={parsedSpecificTime.a} onChange={(e) => setSpecificTimePart("a", e.target.value)} disabled={!isActive || submitting} aria-label="AM/PM" style={{ minWidth: "3.5rem" }}>
                                                                            <option value="AM">AM</option>
                                                                            <option value="PM">PM</option>
                                                                        </select>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {fieldErrors.specificTime && (
                                                                <div className="text-danger small mt-1">{fieldErrors.specificTime}</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* ── Step 3: Additional Details ── */}
                                                {step.key === "additionalDetails" && (
                                                    <div className="mt-3">
                                                        {/* Allow snoozing */}
                                                        <div className="mb-3">
                                                            <label className="form-label">Allow snoozing?</label>
                                                            <div className="goal-task-type-toggle mt-0">
                                                                <button
                                                                    type="button"
                                                                    className={`goal-task-type-option ${answers.allowSnoozing ? "is-active" : ""}`.trim()}
                                                                    onClick={() => updateAnswer("allowSnoozing", true)}
                                                                    disabled={!isActive || submitting}
                                                                >
                                                                    <span className="goal-task-type-option-title">Yes</span>
                                                                    <span className="goal-task-type-option-subtitle">If missed, carry it over to the next day.</span>
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className={`goal-task-type-option ${!answers.allowSnoozing ? "is-active" : ""}`.trim()}
                                                                    onClick={() => {
                                                                        updateAnswer("allowSnoozing", false);
                                                                        updateAnswer("snoozeLimit", "");
                                                                    }}
                                                                    disabled={!isActive || submitting}
                                                                >
                                                                    <span className="goal-task-type-option-title">No</span>
                                                                    <span className="goal-task-type-option-subtitle">Task disappears if not done on the scheduled day.</span>
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Snooze limit */}
                                                        {answers.allowSnoozing && (
                                                            <div className="mb-3">
                                                                <label className="form-label">
                                                                    Snooze limit <span className="text-muted fw-normal">(days, leave empty for no limit)</span>
                                                                </label>
                                                                <input
                                                                    type="number"
                                                                    className={`form-control ${fieldErrors.snoozeLimit ? "is-invalid" : ""}`.trim()}
                                                                    value={answers.snoozeLimit}
                                                                    onChange={(e) => updateAnswer("snoozeLimit", e.target.value)}
                                                                    placeholder="e.g. 3 — or leave empty for infinite snoozing"
                                                                    min={1}
                                                                    step={1}
                                                                    disabled={!isActive || submitting}
                                                                />
                                                                {fieldErrors.snoozeLimit && (
                                                                    <div className="text-danger small mt-1">{fieldErrors.snoozeLimit}</div>
                                                                )}
                                                                <p className="text-muted small mt-1">
                                                                    The task will keep appearing in your planner for this many days after the original date if not completed.
                                                                </p>
                                                            </div>
                                                        )}

                                                        {/* Duration */}
                                                        <div className="mb-3">
                                                            <label className="form-label">
                                                                Estimated duration <span className="text-muted fw-normal">(minutes, optional)</span>
                                                            </label>
                                                            <input
                                                                type="number"
                                                                className="form-control"
                                                                value={answers.durationMinutes}
                                                                onChange={(e) => updateAnswer("durationMinutes", e.target.value)}
                                                                placeholder="e.g. 30"
                                                                min={1}
                                                                step={1}
                                                                disabled={!isActive || submitting}
                                                            />
                                                        </div>

                                                        {/* Note */}
                                                        <div className="mb-3">
                                                            <label className="form-label">
                                                                Note <span className="text-muted fw-normal">(optional)</span>
                                                            </label>
                                                            <textarea
                                                                ref={noteRef}
                                                                className="form-control goal-wizard-reason"
                                                                value={answers.note}
                                                                autoComplete="off"
                                                                onChange={(e) => {
                                                                    updateAnswer("note", e.target.value);
                                                                    resizeTextareaToMaxLines(e.currentTarget, 5);
                                                                }}
                                                                placeholder="Any extra details for this task"
                                                                disabled={!isActive || submitting}
                                                                rows={1}
                                                            />
                                                        </div>
                                                    </div>
                                                )}

                                                {/* ── Step footer ── */}
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
                                                            {submitting ? "Saving…" : isEditMode ? "Save Changes" : "Schedule Task"}{" "}
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
