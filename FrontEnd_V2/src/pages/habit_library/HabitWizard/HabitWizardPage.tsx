import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check2Circle, X } from "react-bootstrap-icons";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import {
    api,
    type GoalDataShortResponse,
    type HabitCreateRequest,
    type HabitDataResponse,
    type HabitPreferredTime,
} from "@/api";
import { ApiError } from "@/api/client";
import LOADING_IMAGE from "@/assets/loading_default.png";
import { StepImageVisual } from "@/components/ui/StepImageVisual/StepImageVisual";
import { ThemeToggle } from "@/components/ui/ThemeToggle/ThemeToggle";
import { useToast } from "@/context/ToastContext";
import { ROUTES } from "@/routes/RoutePaths";
import { GoalWizardVisual } from "@/pages/my_goals/GoalCreationWizard/GoalWizardVisual";

import {
    answersFromDraft,
    answersFromHabit,
    buildTime,
    computeDisabledFreqs,
    FREQ_DAYS,
    FREQ_PERIODS,
    FREQUENCY_OPTIONS,
    getStepBannerError,
    getStepValidationErrors,
    HABIT_LOADER_STEPS,
    makeEmptyAnswers,
    mapApiFieldErrors,
    MINUTES,
    parseOptionalPositiveInt,
    parseTime,
    PREFERRED_TIME_OPTIONS,
    PRIORITY_OPTIONS,
    STEPS,
    type HabitFieldErrorKey,
    type HabitFieldErrors,
    type HabitWizardAnswers,
} from "@/pages/habit_library/HabitWizard/HabitWizard.constants";

import "@/pages/my_goals/GoalCreationWizard/GoalCreationWizard.scss";
import "@/pages/my_goals/GoalMilestoneWizard/GoalMilestoneWizardPage.scss";
import "@/pages/my_goals/GoalTaskWizard/GoalTaskWizardPage.scss";
import "@/pages/habit_library/HabitWizard/HabitWizardPage.scss";

const LOADER_VISUAL_IMAGES = [LOADING_IMAGE];

// ── Component ──────────────────────────────────────────────────────────────────

export function HabitWizardPage() {
    const { habitId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const toast = useToast();

    const isEditMode = Boolean(habitId);
    const numericHabitId = Number(habitId);

    // For edit mode: habit may come from location.state (navigated from library)
    // or we fall back to loading via the list.
    const stateHabit = (location.state as { habit?: HabitDataResponse } | null)?.habit ?? null;
    const stateDraft = (location.state as { draft?: Partial<HabitCreateRequest> } | null)?.draft ?? null;

    const [loadingContext, setLoadingContext] = useState(isEditMode && !stateHabit);
    const [loaderIndex, setLoaderIndex] = useState(0);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [answers, setAnswers] = useState<HabitWizardAnswers>(() => {
        if (isEditMode && stateHabit) return answersFromHabit(stateHabit);
        if (!isEditMode && stateDraft) return answersFromDraft(stateDraft);
        return makeEmptyAnswers();
    });
    const [fieldErrors, setFieldErrors] = useState<HabitFieldErrors>({});
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [dayPickerOpen, setDayPickerOpen] = useState(
        () => (answers.specificDays.length > 0) || (answers.frequencies.includes("specific_day")),
    );
    const [goals, setGoals] = useState<GoalDataShortResponse[]>([]);

    // ── Load context (edit mode fallback or goals list) ────────────────────────
    useEffect(() => {
        // Load goals for step 4 in the background
        void api.goals.getList("Active").then(setGoals).catch(() => { /* goals are optional */ });

        if (!isEditMode) return;

        if (stateHabit) {
            // Already pre-filled from state
            return;
        }

        if (!Number.isInteger(numericHabitId) || numericHabitId <= 0) {
            toast.error("Habit not found.");
            navigate(ROUTES.HABIT_LIBRARY, { replace: true });
            return;
        }

        setLoadingContext(true);
        void api.habits.getList()
            .then((list) => {
                const found = list.find((h) => h.id === numericHabitId);
                if (!found) {
                    toast.error("Habit not found.");
                    navigate(ROUTES.HABIT_LIBRARY, { replace: true });
                    return;
                }
                setAnswers(answersFromHabit(found));
                setDayPickerOpen(
                    (found.specific_days?.length ?? 0) > 0 || (found.frequencies?.includes("specific_day") ?? false),
                );
                setLoadingContext(false);
            })
            .catch((err) => {
                toast.error(err instanceof ApiError ? err.message : "Could not load habit.");
                navigate(ROUTES.HABIT_LIBRARY, { replace: true });
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!loadingContext) { setLoaderIndex(0); return; }
        const interval = window.setInterval(() => {
            setLoaderIndex((cur) => Math.min(cur + 1, HABIT_LOADER_STEPS.length - 1));
        }, 1100);
        return () => window.clearInterval(interval);
    }, [loadingContext]);

    // ── Answer helpers ─────────────────────────────────────────────────────────
    function updateAnswer<K extends keyof HabitWizardAnswers>(key: K, value: HabitWizardAnswers[K]) {
        setAnswers((cur) => ({ ...cur, [key]: value }));
        setFieldErrors((cur) => {
            if (!(key in cur)) return cur;
            const next = { ...cur };
            delete next[key as HabitFieldErrorKey];
            return next;
        });
        setError(null);
    }

    function toggleFrequency(value: string) {
        if (!answers.frequencies.includes(value) && value === "daily") {
            setAnswers((cur) => ({ ...cur, specificDays: [] }));
            setDayPickerOpen(false);
        }

        setAnswers((cur) => {
            let freqs = cur.frequencies;
            if (freqs.includes(value)) {
                freqs = freqs.filter((f) => f !== value);
            } else {
                freqs = [...freqs, value];
                if (value === "daily") freqs = ["daily"];
                if (value === "weekly") freqs = freqs.filter((f) => f !== "monthly" && !(FREQ_DAYS as readonly string[]).includes(f));
                if (value === "monthly") freqs = freqs.filter((f) => !["weekly", "weekdays", "weekends"].includes(f) && !(FREQ_DAYS as readonly string[]).includes(f));
                if (value === "first_of_month" || value === "end_of_month") freqs = freqs.filter((f) => !(FREQ_DAYS as readonly string[]).includes(f));
            }
            return { ...cur, frequencies: freqs };
        });
        setFieldErrors((cur) => { const n = { ...cur }; delete n.frequencies; return n; });
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
            return { ...cur, specificDays: days, frequencies: freqs };
        });
    }

    // ── Specific time picker ────────────────────────────────────────────────────
    const parsedSpecificTime = useMemo(() => parseTime(answers.specificTime), [answers.specificTime]);

    function setSpecificTimePart(part: "h" | "m" | "a", val: string) {
        const p = { ...parsedSpecificTime, [part]: val };
        updateAnswer("specificTime", buildTime(p.h, p.m, p.a));
    }

    // ── Validation ──────────────────────────────────────────────────────────────
    function validateForSubmit(): HabitFieldErrors {
        const errs: HabitFieldErrors = {};
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

            const payload: HabitCreateRequest = {
                title: answers.title.trim(),
                planner_type: answers.plannerType,
                planner_target: isMetric ? parseOptionalPositiveInt(answers.plannerTarget) : null,
                value_unit: isMetric ? (answers.valueUnit.trim() || null) : null,
                note: answers.note.trim() || null,
                frequencies: answers.frequencies,
                priority: answers.priority,
                weekly_count: answers.frequencies.includes("weekly") ? answers.weeklyCount : null,
                monthly_count: answers.frequencies.includes("monthly") ? answers.monthlyCount : null,
                specific_days: answers.specificDays.length > 0 ? answers.specificDays : null,
                day_fallback: answers.dayFallback,
                start_date: answers.setStartDate === "yes" ? answers.startDate : null,
                end_date: answers.setStartDate === "yes" && answers.setEndDate ? answers.endDate : null,
                preferred_time: answers.preferredTime,
                specific_time: specificTimeOut || null,
                duration_minutes: parseOptionalPositiveInt(answers.durationMinutes),
                goal_id: answers.goalId ? Number(answers.goalId) : null,
            };

            if (isEditMode) {
                await api.habits.updateHabit(numericHabitId, payload);
                toast.success("Habit updated successfully.");
            } else {
                await api.habits.createHabit(payload);
                toast.success("Habit created successfully.");
            }

            navigate(ROUTES.HABIT_LIBRARY);
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
                    setError(submitError.message || "Could not save habit right now.");
                }
            } else {
                setError("Could not save habit right now.");
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

    const activeStepKey = STEPS[currentStepIndex]?.key ?? "defineHabit";
    const stepBannerError = getStepBannerError(activeStepKey, fieldErrors);
    const displayError = stepBannerError ?? error;
    const loaderMessage = HABIT_LOADER_STEPS[Math.min(loaderIndex, HABIT_LOADER_STEPS.length - 1)];

    const hasSpecificDay = answers.specificDays.length > 0;
    const disabledFreqs = useMemo(
        () => computeDisabledFreqs(answers.frequencies, hasSpecificDay),
        [answers.frequencies, hasSpecificDay],
    );

    // ── Scheduling section (Step 2) ────────────────────────────────────────────
    function renderSchedulingSection(isActive: boolean) {
        const isMetric = answers.plannerType === "metric";

        return (
            <div className="mt-3">
                {/* Planner target + value unit (metric only) */}
                {isMetric && (
                    <div className="row g-3 mb-3">
                        <div className="col-md-6">
                            <label className="form-label">
                                How many {answers.valueUnit ? <strong>{answers.valueUnit}</strong> : "units"} per session?
                            </label>
                            <input
                                type="number"
                                className={`form-control ${fieldErrors.plannerTarget ? "is-invalid" : ""}`.trim()}
                                value={answers.plannerTarget}
                                onChange={(e) => updateAnswer("plannerTarget", e.target.value)}
                                placeholder="e.g. 10"
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
                                onChange={(e) => updateAnswer("valueUnit", e.target.value)}
                                placeholder="e.g. pages, km, reps"
                                disabled={!isActive || submitting}
                            />
                            {fieldErrors.valueUnit && (
                                <div className="text-danger small mt-1">{fieldErrors.valueUnit}</div>
                            )}
                        </div>
                    </div>
                )}

                {/* Priority */}
                <div className="mb-3">
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

                {/* Frequency chips */}
                <div className="mb-3">
                    <label className="form-label">How often?</label>
                    {fieldErrors.frequencies && (
                        <div className="text-danger small mb-1">{fieldErrors.frequencies}</div>
                    )}
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

                    {/* Weekly count */}
                    {answers.frequencies.includes("weekly") && (
                        <div className="d-flex align-items-center gap-2 mt-2 p-2" style={{ border: "1.5px dashed var(--jv-faint, #d0d0d8)", borderRadius: "0.5rem" }}>
                            <span className="text-muted small">Times per week:</span>
                            <div className="d-inline-flex align-items-center gap-2">
                                <button type="button" className="btn btn-sm btn-outline-secondary"
                                    style={{ width: "1.75rem", height: "1.75rem", padding: 0, borderRadius: "50%", lineHeight: 1, opacity: (!isActive || submitting || answers.weeklyCount <= 1) ? 0.35 : 1 }}
                                    onClick={() => updateAnswer("weeklyCount", Math.max(1, answers.weeklyCount - 1))}
                                    disabled={!isActive || submitting || answers.weeklyCount <= 1}
                                >−</button>
                                <span style={{ minWidth: "1.5rem", textAlign: "center", fontWeight: 600 }}>{answers.weeklyCount}</span>
                                <button type="button" className="btn btn-sm btn-outline-secondary"
                                    style={{ width: "1.75rem", height: "1.75rem", padding: 0, borderRadius: "50%", lineHeight: 1, opacity: (!isActive || submitting || answers.weeklyCount >= 6) ? 0.35 : 1 }}
                                    onClick={() => updateAnswer("weeklyCount", Math.min(6, answers.weeklyCount + 1))}
                                    disabled={!isActive || submitting || answers.weeklyCount >= 6}
                                >+</button>
                            </div>
                        </div>
                    )}

                    {/* Monthly count */}
                    {answers.frequencies.includes("monthly") && (
                        <div className="d-flex align-items-center gap-2 mt-2 p-2" style={{ border: "1.5px dashed var(--jv-faint, #d0d0d8)", borderRadius: "0.5rem" }}>
                            <span className="text-muted small">Times per month:</span>
                            <div className="d-inline-flex align-items-center gap-2">
                                <button type="button" className="btn btn-sm btn-outline-secondary"
                                    style={{ width: "1.75rem", height: "1.75rem", padding: 0, borderRadius: "50%", lineHeight: 1, opacity: (!isActive || submitting || answers.monthlyCount <= 1) ? 0.35 : 1 }}
                                    onClick={() => updateAnswer("monthlyCount", Math.max(1, answers.monthlyCount - 1))}
                                    disabled={!isActive || submitting || answers.monthlyCount <= 1}
                                >−</button>
                                <span style={{ minWidth: "1.5rem", textAlign: "center", fontWeight: 600 }}>{answers.monthlyCount}</span>
                                <button type="button" className="btn btn-sm btn-outline-secondary"
                                    style={{ width: "1.75rem", height: "1.75rem", padding: 0, borderRadius: "50%", lineHeight: 1, opacity: (!isActive || submitting || answers.monthlyCount >= 27) ? 0.35 : 1 }}
                                    onClick={() => updateAnswer("monthlyCount", Math.min(27, answers.monthlyCount + 1))}
                                    disabled={!isActive || submitting || answers.monthlyCount >= 27}
                                >+</button>
                            </div>
                        </div>
                    )}

                    {/* Specific day grid */}
                    {dayPickerOpen && (
                        <div className="mt-2">
                            <p className="text-muted small mb-1">Which days of the month?</p>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "0.375rem" }}>
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

    // ── Loading state ──────────────────────────────────────────────────────────
    if (loadingContext) {
        return (
            <div className="goal-wizard-backdrop">
                <div className="goal-wizard-page-theme-toggle"><ThemeToggle /></div>
                <section className="goal-wizard-shell" aria-labelledby="habit-wizard-title">
                    <div className="goal-wizard-main">
                        <header className="goal-wizard-header">
                            <div className="goal-wizard-header-main">
                                <button type="button" className="btn btn-ghost btn-icon goal-wizard-close" onClick={() => navigate(-1)} aria-label="Close habit setup">
                                    <X size={30} />
                                </button>
                                <div className="goal-wizard-header-copy">
                                    <h3 id="habit-wizard-title">Loading habit setup</h3>
                                    <p>We are bringing your habit details into view.</p>
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
                                    {HABIT_LOADER_STEPS.map((step, i) => (
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

            <section className="goal-wizard-shell" aria-labelledby="habit-wizard-title">
                <div className="goal-wizard-main">
                    <header className="goal-wizard-header">
                        <div className="goal-wizard-header-main">
                            <button
                                type="button"
                                className="btn btn-ghost btn-icon goal-wizard-close"
                                onClick={() => navigate(ROUTES.HABIT_LIBRARY)}
                                aria-label="Close habit setup"
                                disabled={submitting}
                            >
                                <X size={30} />
                            </button>
                            <div className="goal-wizard-header-copy">
                                <h3 id="habit-wizard-title">{isEditMode ? "Edit Habit" : "Create Habit"}</h3>
                            </div>
                        </div>
                    </header>

                    <div className="goal-wizard-body">
                        <aside className="goal-wizard-stepper" aria-label="Habit setup steps">
                            {STEPS.map((step, index) => {
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

                                                {/* ── Step 1: Define Habit ── */}
                                                {step.key === "defineHabit" && (
                                                    <>
                                                        <div className="mt-3">
                                                            <label className="form-label">Title</label>
                                                            <input
                                                                className={`form-control goal-wizard-title-input ${fieldErrors.title ? "is-invalid" : ""}`.trim()}
                                                                value={answers.title}
                                                                autoComplete="off"
                                                                onChange={(e) => updateAnswer("title", e.target.value)}
                                                                placeholder="e.g. Meditate, Exercise, Read"
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
                                                                    <span className="goal-task-type-option-subtitle">Mark the habit done each session.</span>
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
                                                            {answers.plannerType === "metric" ?
                                                                "Metric habits like 'Read 20 pages' or 'Run 5 km' let you track progress toward a measurable target." :
                                                                "Simple habits like 'Meditate' or 'Exercise' let you mark the habit done each session without tracking a specific target."
                                                            }
                                                        </p>
                                                    </>
                                                )}

                                                {/* ── Step 2: Configure Planning ── */}
                                                {step.key === "configurePlanning" && renderSchedulingSection(isActive)}

                                                {/* ── Step 3: Habit Timeline ── */}
                                                {step.key === "habitTimeline" && (
                                                    <div className="mt-3">
                                                        <div className="mb-3">
                                                            <label className="form-label">Do you want to set a start date?</label>
                                                            <div className="goal-task-type-toggle mt-0">
                                                                <button
                                                                    type="button"
                                                                    className={`goal-task-type-option ${answers.setStartDate === "yes" ? "is-active" : ""}`.trim()}
                                                                    onClick={() => updateAnswer("setStartDate", "yes")}
                                                                    disabled={!isActive || submitting}
                                                                >
                                                                    <span className="goal-task-type-option-title">Yes</span>
                                                                    <span className="goal-task-type-option-subtitle">Set the date from which this habit is active.</span>
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className={`goal-task-type-option ${answers.setStartDate === "no" ? "is-active" : ""}`.trim()}
                                                                    onClick={() => {
                                                                        updateAnswer("setStartDate", "no");
                                                                        updateAnswer("setEndDate", false);
                                                                        updateAnswer("endDate", "");
                                                                    }}
                                                                    disabled={!isActive || submitting}
                                                                >
                                                                    <span className="goal-task-type-option-title">No</span>
                                                                    <span className="goal-task-type-option-subtitle">Habit is active from today indefinitely.</span>
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {answers.setStartDate === "yes" && (
                                                            <>
                                                                <div className="row g-3 mb-3">
                                                                    <div className={`col-12 ${answers.setEndDate ? "col-md-6" : ""}`}>
                                                                        <label className="form-label">Start date</label>
                                                                        <input
                                                                            type="date"
                                                                            className={`form-control ${fieldErrors.startDate ? "is-invalid" : ""}`.trim()}
                                                                            value={answers.startDate}
                                                                            onChange={(e) => updateAnswer("startDate", e.target.value)}
                                                                            disabled={!isActive || submitting}
                                                                        />
                                                                        {fieldErrors.startDate && (
                                                                            <div className="text-danger small mt-1">{fieldErrors.startDate}</div>
                                                                        )}
                                                                    </div>
                                                                    {answers.setEndDate && (
                                                                        <div className="col-12 col-md-6">
                                                                            <label className="form-label">End date</label>
                                                                            <input
                                                                                type="date"
                                                                                className={`form-control ${fieldErrors.endDate ? "is-invalid" : ""}`.trim()}
                                                                                value={answers.endDate}
                                                                                min={answers.startDate}
                                                                                onChange={(e) => updateAnswer("endDate", e.target.value)}
                                                                                disabled={!isActive || submitting}
                                                                            />
                                                                            {fieldErrors.endDate && (
                                                                                <div className="text-danger small mt-1">{fieldErrors.endDate}</div>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                <div className="mb-3">
                                                                    <label className="d-flex align-items-center gap-2">
                                                                        <input
                                                                            type="checkbox"
                                                                            className="habit-checkbox"
                                                                            checked={answers.setEndDate}
                                                                            onChange={(e) => {
                                                                                updateAnswer("setEndDate", e.target.checked);
                                                                                if (!e.target.checked) updateAnswer("endDate", "");
                                                                            }}
                                                                            disabled={!isActive || submitting}
                                                                            style={{ accentColor: "var(--jv-brand-1, #6366f1)" }}
                                                                        />
                                                                        <span className="form-label mb-0">Set an end date?</span>
                                                                    </label>
                                                                </div>

                                                                <p className="text-muted small">
                                                                    The daily planner will only include this habit between the start and end dates.
                                                                </p>
                                                            </>
                                                        )}
                                                    </div>
                                                )}

                                                {/* ── Step 4: Additional Details ── */}
                                                {step.key === "additionalDetails" && (
                                                    <div className="mt-3">
                                                        {/* Preferred time */}
                                                        <div className="mb-3">
                                                            <label className="form-label">
                                                                When do you prefer to do it? <span className="text-muted fw-normal">(optional)</span>
                                                            </label>
                                                            <div className="d-flex gap-2 align-items-center">
                                                                <select
                                                                    className="form-select"
                                                                    value={answers.preferredTime}
                                                                    onChange={(e) => {
                                                                        updateAnswer("preferredTime", e.target.value as HabitPreferredTime);
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
                                                            {fieldErrors.specificTime && (
                                                                <div className="text-danger small mt-1">{fieldErrors.specificTime}</div>
                                                            )}
                                                        </div>

                                                        {/* Duration */}
                                                        <div className="mb-3">
                                                            <label className="form-label">
                                                                How long does it take? <span className="text-muted fw-normal">(minutes, optional)</span>
                                                            </label>
                                                            <input
                                                                type="number"
                                                                className="form-control"
                                                                value={answers.durationMinutes}
                                                                onChange={(e) => updateAnswer("durationMinutes", e.target.value)}
                                                                placeholder="e.g. 20"
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
                                                            <input
                                                                type="text"
                                                                className="form-control"
                                                                value={answers.note}
                                                                autoComplete="off"
                                                                onChange={(e) => updateAnswer("note", e.target.value)}
                                                                placeholder="Any extra details for this habit"
                                                                disabled={!isActive || submitting}
                                                            />
                                                        </div>

                                                        {/* Link to a goal */}
                                                        {goals.length > 0 && (
                                                            <div className="mb-3">
                                                                <label className="form-label">
                                                                    Link to a goal <span className="text-muted fw-normal">(optional)</span>
                                                                </label>
                                                                <select
                                                                    className="form-select"
                                                                    value={answers.goalId}
                                                                    onChange={(e) => updateAnswer("goalId", e.target.value)}
                                                                    disabled={!isActive || submitting}
                                                                >
                                                                    <option value="">No goal linked</option>
                                                                    {goals.map((g) => (
                                                                        <option key={g.id} value={String(g.id)}>{g.title}</option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        )}
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
                                                            {submitting ? "Saving…" : isEditMode ? "Save Changes" : "Create Habit"}{" "}
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
