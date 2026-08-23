import { useEffect, useRef, useState } from "react";
import { ChevronRight, PlusCircleFill, XLg } from "react-bootstrap-icons";
import { SLIDE_OUT_DURATION_MS, FREQUENCY_OPTIONS, PREFERRED_TIME_OPTIONS, PRIORITY_OPTIONS, EMPTY_DRAFT } from "@/pages/habit_library/HabitFormPanel/HabitFormPanel.constants";
import { resizeTextareaToMaxLines } from "@/services/textarea-resize.service";
import { api, ApiError } from "@/api";
import type { HabitDataResponse, HabitCreateRequest } from "@/api";

import "@/pages/my_goals/GoalCreationWizard/GoalCreationWizard.scss";
import "@/pages/assistant/RefinedGoalReviewPanel/RefinedGoalReviewPanel.scss";
import "@/pages/habit_library/HabitFormPanel/HabitFormPanel.scss";

const MINUTES = ["00","05","10","15","20","25","30","35","40","45","50","55"];

const FREQ_DAYS    = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
const FREQ_PERIODS = ["daily","weekly","monthly","weekdays","weekends","first_of_month","end_of_month"];

function computeDisabledFreqs(freqs: string[], hasSpecificDay: boolean): Set<string> {
    const d = new Set<string>();
    if (freqs.includes("daily")) {
        [...FREQ_DAYS, ...FREQ_PERIODS, "specific_day"].filter((v) => v !== "daily").forEach((v) => d.add(v));
        return d;
    }
    if (freqs.includes("weekdays")) ["monday","tuesday","wednesday","thursday","friday"].forEach((v) => d.add(v));
    if (freqs.includes("weekends")) ["saturday","sunday"].forEach((v) => d.add(v));
    if (freqs.includes("weekly"))  d.add("monthly");
    if (freqs.includes("monthly")) { d.add("weekly"); d.add("weekdays"); d.add("weekends"); }
    if (freqs.some((f) => ["weekly","monthly","first_of_month","end_of_month"].includes(f)) || hasSpecificDay) {
        FREQ_DAYS.forEach((v) => d.add(v));
    }
    return d;
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

function buildTime(h: string, m: string, a: string): string {
    let hour = parseInt(h, 10);
    if (a === "PM" && hour !== 12) hour += 12;
    if (a === "AM" && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${m}`;
}

export interface HabitFormPanelProps {
    mode: "create" | "edit";
    initialDraft?: Partial<HabitCreateRequest>;
    editingId?: number;
    onClose: () => void;
    onSaved?: (habit: HabitDataResponse) => void;
}

export function HabitFormPanel({ mode, initialDraft, editingId, onClose, onSaved }: HabitFormPanelProps) {
    const [draft, setDraft] = useState<HabitCreateRequest>({ ...EMPTY_DRAFT, ...initialDraft });
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [isClosing, setIsClosing] = useState(false);
    const [revealedOrder, setRevealedOrder] = useState<Array<"preferred_time" | "duration" | "dates">>(() => {
        const order: Array<"preferred_time" | "duration" | "dates"> = [];
        if (initialDraft?.preferred_time && initialDraft.preferred_time !== "flexible") order.push("preferred_time");
        if (initialDraft?.duration_minutes != null) order.push("duration");
        if (initialDraft?.start_date || initialDraft?.end_date) order.push("dates");
        return order;
    });
    const [weeklyCount,  setWeeklyCount]  = useState(() => initialDraft?.weekly_count ?? 1);
    const [monthlyCount, setMonthlyCount] = useState(() => initialDraft?.monthly_count ?? 1);
    const [specificDays,    setSpecificDays]    = useState<number[]>(() => initialDraft?.specific_days ?? []);
    const [dayPickerOpen,   setDayPickerOpen]   = useState(() =>
        (initialDraft?.specific_days?.length ?? 0) > 0 || (initialDraft?.frequencies?.includes("specific_day") ?? false)
    );
    const [dayFallback,     setDayFallback]     = useState(() => initialDraft?.day_fallback ?? false);
    const motivationRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (motivationRef.current) resizeTextareaToMaxLines(motivationRef.current, 5);
    }, []);

    function requestClose() {
        if (isClosing) return;
        setIsClosing(true);
        window.setTimeout(onClose, SLIDE_OUT_DURATION_MS);
    }

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !saving) requestClose();
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [saving, isClosing]);

    function set<K extends keyof HabitCreateRequest>(key: K, value: HabitCreateRequest[K]) {
        setDraft((prev) => ({ ...prev, [key]: value }));
        setFormError(null);
        setFieldErrors((prev) => {
            const k = key as string;
            if (!prev[k]) return prev;
            const next = { ...prev };
            delete next[k];
            return next;
        });
    }

    function reveal(key: "preferred_time" | "duration" | "dates") {
        if (revealedOrder.includes(key)) return;
        setRevealedOrder((prev) => [...prev, key]);
        if (key === "preferred_time") setDraft((prev) => ({ ...prev, preferred_time: "morning" }));
        if (key === "dates") setDraft((prev) => ({ ...prev, start_date: new Date().toISOString().slice(0, 10) }));
    }

    function unreveal(key: "preferred_time" | "duration" | "dates") {
        setRevealedOrder((prev) => prev.filter((k) => k !== key));
        if (key === "preferred_time") setDraft((prev) => ({ ...prev, preferred_time: "flexible", specific_time: "" }));
        if (key === "duration") setDraft((prev) => ({ ...prev, duration_minutes: null }));
        if (key === "dates") setDraft((prev) => ({ ...prev, start_date: null, end_date: null }));
        setFormError(null);
    }

    function toggleFrequency(value: string) {
        const adding = !draft.frequencies.includes(value);
        if (adding && value === "daily") { setSpecificDays([]); setDayPickerOpen(false); setDayFallback(false); }
        setDraft((prev) => {
            if (prev.frequencies.includes(value)) {
                return { ...prev, frequencies: prev.frequencies.filter((f) => f !== value) };
            }
            let next = [...prev.frequencies, value];
            if (value === "daily") {
                next = ["daily"];
            }
            if (value === "weekly") {
                next = next.filter((f) => f !== "monthly");
                next = next.filter((f) => !FREQ_DAYS.includes(f));
            }
            if (value === "monthly") {
                next = next.filter((f) => !["weekly","weekdays","weekends"].includes(f));
                next = next.filter((f) => !FREQ_DAYS.includes(f));
            }
            if (value === "first_of_month" || value === "end_of_month") {
                next = next.filter((f) => !FREQ_DAYS.includes(f));
            }
            if (value === "weekdays") {
                next = next.filter((f) => !["monday","tuesday","wednesday","thursday","friday"].includes(f));
            }
            if (value === "weekends") {
                next = next.filter((f) => !["saturday","sunday"].includes(f));
            }
            return { ...prev, frequencies: next };
        });
        setFormError(null);
        setFieldErrors((prev) => {
            if (!prev.frequencies) return prev;
            const next = { ...prev };
            delete next.frequencies;
            return next;
        });
    }

    async function handleSave() {
        const name = draft.name.trim();
        if (!name) {
            setFieldErrors({ name: "Habit name is required." });
            setFormError("Habit name is required.");
            return;
        }
        if (draft.frequencies.length === 0) {
            setFieldErrors({ frequencies: "Select at least one frequency." });
            setFormError("Select at least one frequency.");
            return;
        }
        if (draft.preferred_time === "custom" && !draft.specific_time.trim()) {
            setFieldErrors({ specific_time: "Please enter a specific time." });
            setFormError("Please enter a specific time.");
            return;
        }
        const today = new Date().toISOString().slice(0, 10);
        if (!isEdit && draft.start_date && draft.start_date < today) {
            setFieldErrors({ start_date: "Start date cannot be in the past." });
            setFormError("Start date cannot be in the past.");
            return;
        }
        if (draft.start_date && draft.end_date && draft.end_date < draft.start_date) {
            setFieldErrors({ end_date: "End date cannot be before the start date." });
            setFormError("End date cannot be before the start date.");
            return;
        }

        setSaving(true);
        setFormError(null);
        setFieldErrors({});

        const durationVal = Number(draft.duration_minutes);
        const payload: HabitCreateRequest = {
            name,
            motivation: draft.motivation?.trim() || null,
            frequencies: [...draft.frequencies],
            preferred_time: draft.preferred_time,
            specific_time: draft.preferred_time === "custom" ? draft.specific_time : "",
            duration_minutes: Number.isFinite(durationVal) && durationVal > 0 ? durationVal : null,
            start_date: draft.start_date || null,
            end_date: draft.end_date,
            priority: draft.priority,
            weekly_count: draft.frequencies.includes("weekly") ? weeklyCount : null,
            monthly_count: draft.frequencies.includes("monthly") ? monthlyCount : null,
            specific_days: specificDays.length > 0 ? specificDays : null,
            day_fallback: dayFallback,
        };

        try {
            const saved: HabitDataResponse = editingId != null
                ? await api.habits.updateHabit(editingId, payload)
                : await api.habits.createHabit(payload);
            onSaved?.(saved);
            requestClose();
        } catch (err) {
            if (err instanceof ApiError) {
                setFormError(err.message);
                if (err.fieldErrors) setFieldErrors(err.fieldErrors);
            } else {
                setFormError("Something went wrong. Please try again.");
            }
        } finally {
            setSaving(false);
        }
    }

    const isEdit = mode === "edit";
    const disabledFreqs = computeDisabledFreqs(draft.frequencies, dayPickerOpen || specificDays.length > 0);

    return (
        <div className="goal-refined-review-backdrop habit-form-panel" onClick={requestClose}>
            <section
                className={`goal-refined-review-panel${isClosing ? " is-closing" : ""}`}
                aria-labelledby="habit-form-panel-title"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="goal-wizard-header">
                    <div className="goal-wizard-header-main w-100">
                        <div className="goal-wizard-header-copy w-100">
                            <h3 id="habit-form-panel-title" className="d-flex align-items-center justify-content-between">
                                {isEdit ? "Edit habit" : "New habit"}
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-icon goal-wizard-close"
                                    onClick={requestClose}
                                    aria-label="Close habit panel"
                                    disabled={saving}
                                >
                                    <ChevronRight size={25} />
                                </button>
                            </h3>
                            <p>
                                {isEdit
                                    ? "Update your recurring commitment."
                                    : "Tell us about the habit — the planner will handle the scheduling."}
                            </p>
                        </div>
                    </div>
                </header>

                <div className="goal-wizard-body less-padding">
                    <div className="goal-wizard-review">
                        <div className="goal-wizard-review-form">

                            {/* Q1 – What is the habit? */}
                            <div>
                                <label className="form-label" htmlFor="habit-panel-name">
                                    Name your new habit?
                                </label>
                                <input
                                    id="habit-panel-name"
                                    className={`form-control${fieldErrors.name ? " is-invalid" : ""}`}
                                    placeholder="e.g. Read 10 pages, Morning run, LeetCode practice…"
                                    autoComplete="off"
                                    value={draft.name}
                                    disabled={saving}
                                    onChange={(e) => set("name", e.target.value)}
                                />
                            </div>

                            {/* Q2 – How often? */}
                            <div className="d-flex flex-column gap-3">
                                <span className="form-label mb-0">How often?</span>

                                {/* Row 1 – days of week */}
                                <div className="d-flex flex-wrap gap-2">
                                    {FREQUENCY_OPTIONS.filter((o) => FREQ_DAYS.includes(o.value)).map((opt) => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            className={`btn btn-sm ${draft.frequencies.includes(opt.value) ? "btn-soft" : "btn-outline-secondary"}`}
                                            onClick={() => toggleFrequency(opt.value)}
                                            disabled={saving || disabledFreqs.has(opt.value)}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>

                                {/* Row 2 – period options + Specific day */}
                                <div className="d-flex flex-wrap gap-2">
                                    {FREQUENCY_OPTIONS.filter((o) => FREQ_PERIODS.includes(o.value)).map((opt) => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            className={`btn btn-sm ${draft.frequencies.includes(opt.value) ? "btn-soft" : "btn-outline-secondary"}`}
                                            onClick={() => toggleFrequency(opt.value)}
                                            disabled={saving || disabledFreqs.has(opt.value)}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                    <button
                                        type="button"
                                        className={`btn btn-sm ${(dayPickerOpen || specificDays.length > 0) ? "btn-soft" : "btn-outline-secondary"}`}
                                        onClick={() => {
                                            if (dayPickerOpen) {
                                                setDayPickerOpen(false);
                                                setSpecificDays([]);
                                                setDayFallback(false);
                                                setDraft((prev) => ({
                                                    ...prev,
                                                    frequencies: prev.frequencies.filter((f) => f !== "specific_day"),
                                                }));
                                            } else {
                                                setDayPickerOpen(true);
                                                setDraft((prev) => ({
                                                    ...prev,
                                                    frequencies: [
                                                        ...prev.frequencies.filter((f) => !FREQ_DAYS.includes(f)),
                                                        "specific_day",
                                                    ],
                                                }));
                                            }
                                        }}
                                        disabled={saving || disabledFreqs.has("specific_day")}
                                    >
                                        Specific day
                                    </button>
                                </div>

                                {/* Weekly count */}
                                {draft.frequencies.includes("weekly") && (
                                    <div className="habit-freq-sub d-flex align-items-center justify-content-between">
                                        <span className="text-muted-1 small">Times per week</span>
                                        <div className="habit-counter">
                                            <button type="button" className="btn btn-sm btn-outline-secondary habit-counter-btn" onClick={() => setWeeklyCount((c) => Math.max(1, c - 1))} disabled={saving || weeklyCount <= 1}>−</button>
                                            <span className="habit-counter-val">{weeklyCount}</span>
                                            <button type="button" className="btn btn-sm btn-outline-secondary habit-counter-btn" onClick={() => setWeeklyCount((c) => Math.min(6, c + 1))} disabled={saving || weeklyCount >= 6}>+</button>
                                        </div>
                                    </div>
                                )}

                                {/* Monthly count */}
                                {draft.frequencies.includes("monthly") && (
                                    <div className="habit-freq-sub d-flex align-items-center justify-content-between">
                                        <span className="text-muted-1 small">Times per month</span>
                                        <div className="habit-counter">
                                            <button type="button" className="btn btn-sm btn-outline-secondary habit-counter-btn" onClick={() => setMonthlyCount((c) => Math.max(1, c - 1))} disabled={saving || monthlyCount <= 1}>−</button>
                                            <span className="habit-counter-val">{monthlyCount}</span>
                                            <button type="button" className="btn btn-sm btn-outline-secondary habit-counter-btn" onClick={() => setMonthlyCount((c) => Math.min(27, c + 1))} disabled={saving || monthlyCount >= 27}>+</button>
                                        </div>
                                    </div>
                                )}

                                {/* Specific day picker */}
                                {dayPickerOpen && (
                                    <div className="d-flex flex-column gap-2">
                                        <div className="habit-day-grid">
                                            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                                                <button
                                                    key={day}
                                                    type="button"
                                                    className={`habit-day-cell${specificDays.includes(day) ? " is-active" : ""}`}
                                                    onClick={() => {
                                                        const next = specificDays.includes(day)
                                                            ? specificDays.filter((d) => d !== day)
                                                            : [...specificDays, day];
                                                        setSpecificDays(next);
                                                        if (!next.some((d) => d >= 29)) setDayFallback(false);
                                                    }}
                                                    disabled={saving}
                                                >
                                                    {day}
                                                </button>
                                            ))}
                                        </div>
                                        {specificDays.some((d) => d >= 29) && (
                                            <label className="d-flex align-items-start gap-2 habit-fallback-label">
                                                <input
                                                    type="checkbox"
                                                    className="habit-checkbox"
                                                    checked={dayFallback}
                                                    onChange={(e) => setDayFallback(e.target.checked)}
                                                    disabled={saving}
                                                />
                                                <span className="small">
                                                    If any selected date ({specificDays.filter((d) => d >= 29).join(", ")}) doesn't exist in a month, use the last day instead (skip otherwise)
                                                </span>
                                            </label>
                                        )}
                                    </div>
                                )}

                                {fieldErrors.frequencies && (
                                    <div className="invalid-feedback d-block">{fieldErrors.frequencies}</div>
                                )}
                            </div>

                            {/* Q3 – Priority */}
                            <div>
                                <label className="form-label" htmlFor="habit-panel-priority">
                                    Priority
                                </label>
                                <select
                                    id="habit-panel-priority"
                                    className={`form-select${fieldErrors.priority ? " is-invalid" : ""}`}
                                    value={draft.priority ?? "medium"}
                                    disabled={saving}
                                    onChange={(e) => set("priority", e.target.value as HabitCreateRequest["priority"])}
                                >
                                    {PRIORITY_OPTIONS.map(({ value, label }) => (
                                        <option key={value} value={value}>{label}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Q4 – Why? */}
                            <div>
                                <label className="form-label" htmlFor="habit-panel-motivation">
                                    Why do you want to build this habit?{" "}
                                    <span className="text-muted-2 fw-normal">(optional)</span>
                                </label>
                                <textarea
                                    ref={motivationRef}
                                    id="habit-panel-motivation"
                                    className={`form-control${fieldErrors.motivation ? " is-invalid" : ""}`}
                                    rows={3}
                                    placeholder="Context helps your daily planner give better suggestions."
                                    value={draft.motivation ?? ""}
                                    disabled={saving}
                                    style={{ overflowY: "hidden", resize: "none" }}
                                    onChange={(e) => {
                                        set("motivation", e.target.value);
                                        resizeTextareaToMaxLines(e.target, 5);
                                    }}
                                />
                            </div>

                            {/* Optional sections — rendered in the order the user reveals them */}
                            {revealedOrder.map((key) => {
                                if (key === "preferred_time") return (
                                    <div key="preferred_time" className="habit-optional-section">
                                        <div className="habit-optional-section-header">
                                            <label className="form-label mb-0" htmlFor="habit-panel-time">
                                                When do you prefer to do it?
                                            </label>
                                            <button type="button" className="habit-dismiss-btn" onClick={() => unreveal("preferred_time")} disabled={saving} aria-label="Remove preferred time">
                                                <XLg size={11} />
                                            </button>
                                        </div>
                                        <div className="d-flex gap-2 mt-2">
                                            <select
                                                id="habit-panel-time"
                                                className={`form-select${fieldErrors.preferred_time ? " is-invalid" : ""}`}
                                                value={draft.preferred_time === "flexible" ? "morning" : draft.preferred_time}
                                                disabled={saving}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setDraft((prev) => ({
                                                        ...prev,
                                                        preferred_time: val,
                                                        specific_time: val === "custom" ? prev.specific_time : "",
                                                    }));
                                                    setFormError(null);
                                                    setFieldErrors((prev) => {
                                                        const next = { ...prev };
                                                        delete next.preferred_time;
                                                        delete next.specific_time;
                                                        return next;
                                                    });
                                                }}
                                            >
                                                {PREFERRED_TIME_OPTIONS.map(({ value, label }) => (
                                                    <option key={value} value={value}>{label}</option>
                                                ))}
                                            </select>
                                            {draft.preferred_time === "custom" && (() => {
                                                const { h, m, a } = parseTime(draft.specific_time);
                                                const isInvalid = !!fieldErrors.specific_time;
                                                return (
                                                    <div className="d-flex gap-1 align-items-center">
                                                        <select
                                                            className={`form-select habit-time-select${isInvalid ? " is-invalid" : ""}`}
                                                            value={h}
                                                            disabled={saving}
                                                            onChange={(e) => set("specific_time", buildTime(e.target.value, m, a))}
                                                            aria-label="Hour"
                                                        >
                                                            {[1,2,3,4,5,6,7,8,9,10,11,12].map((n) => (
                                                                <option key={n} value={String(n)}>{String(n).padStart(2, "0")}</option>
                                                            ))}
                                                        </select>
                                                        :
                                                        <select
                                                            className={`form-select habit-time-select${isInvalid ? " is-invalid" : ""}`}
                                                            value={m}
                                                            disabled={saving}
                                                            onChange={(e) => set("specific_time", buildTime(h, e.target.value, a))}
                                                            aria-label="Minute"
                                                        >
                                                            {MINUTES.map((min) => (
                                                                <option key={min} value={min}>{min}</option>
                                                            ))}
                                                        </select>
                                                        <select
                                                            className={`form-select habit-time-select${isInvalid ? " is-invalid" : ""}`}
                                                            value={a}
                                                            disabled={saving}
                                                            onChange={(e) => set("specific_time", buildTime(h, m, e.target.value))}
                                                            aria-label="AM/PM"
                                                            style={{ minWidth: "3.5rem" }}
                                                        >
                                                            <option value="AM">AM</option>
                                                            <option value="PM">PM</option>
                                                        </select>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                );
                                if (key === "duration") return (
                                    <div key="duration" className="habit-optional-section">
                                        <div className="habit-optional-section-header">
                                            <label className="form-label mb-0" htmlFor="habit-panel-duration">
                                                How long does it take?{" "}
                                                <span className="text-muted-2 fw-normal">(minutes)</span>
                                            </label>
                                            <button type="button" className="habit-dismiss-btn" onClick={() => unreveal("duration")} disabled={saving} aria-label="Remove duration">
                                                <XLg size={11} />
                                            </button>
                                        </div>
                                        <input
                                            id="habit-panel-duration"
                                            type="number"
                                            className={`form-control mt-2${fieldErrors.duration_minutes ? " is-invalid" : ""}`}
                                            placeholder="e.g. 20"
                                            min={1}
                                            step={1}
                                            value={draft.duration_minutes ?? ""}
                                            disabled={saving}
                                            onChange={(e) => set("duration_minutes", e.target.value === "" ? null : parseInt(e.target.value, 10))}
                                        />
                                    </div>
                                );
                                if (key === "dates") return (
                                    <div key="dates" className="habit-optional-section">
                                        <div className="d-flex gap-3">
                                            <div className="flex-grow-1">
                                                <div className="habit-optional-section-header">
                                                    <label className="form-label mb-0" htmlFor="habit-panel-start">Start date</label>
                                                    <button type="button" className="habit-dismiss-btn" onClick={() => unreveal("dates")} disabled={saving} aria-label="Remove dates">
                                                        <XLg size={11} />
                                                    </button>
                                                </div>
                                                <input
                                                    id="habit-panel-start"
                                                    type="date"
                                                    className={`form-control${fieldErrors.start_date ? " is-invalid" : ""}`}
                                                    value={draft.start_date ?? ""}
                                                    min={new Date().toISOString().slice(0, 10)}
                                                    disabled={saving}
                                                    onChange={(e) => {
                                                        const newStart = e.target.value || null;
                                                        setDraft((prev) => ({
                                                            ...prev,
                                                            start_date: newStart,
                                                            end_date: prev.end_date != null && newStart && newStart > prev.end_date
                                                                ? newStart
                                                                : prev.end_date,
                                                        }));
                                                        setFormError(null);
                                                        setFieldErrors((prev) => {
                                                            const next = { ...prev };
                                                            delete next.start_date;
                                                            delete next.end_date;
                                                            return next;
                                                        });
                                                    }}
                                                />
                                            </div>
                                            {draft.end_date != null && (
                                                <div className="flex-grow-1">
                                                    <div className="habit-optional-section-header">
                                                        <label className="form-label" htmlFor="habit-panel-end">End date</label>
                                                        <button type="button" className="habit-dismiss-btn" onClick={() => set("end_date", null)} disabled={saving} aria-label="Remove end date">
                                                            <XLg size={11} />
                                                        </button>
                                                    </div>
                                                    <input
                                                        id="habit-panel-end"
                                                        type="date"
                                                        className={`form-control${fieldErrors.end_date ? " is-invalid" : ""}`}
                                                        value={draft.end_date ?? ""}
                                                        min={draft.start_date ?? undefined}
                                                        disabled={saving}
                                                        onChange={(e) => set("end_date", e.target.value || null)}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                                return null;
                            })}

                            {/* Reveal links for not-yet-shown optional fields */}
                            <div className="habit-reveal-links">
                                {!revealedOrder.includes("preferred_time") && (
                                    <button type="button" className="habit-reveal-link" onClick={() => reveal("preferred_time")} disabled={saving}>
                                        <PlusCircleFill size={12} />
                                        Any preferred time?
                                    </button>
                                )}
                                {!revealedOrder.includes("duration") && (
                                    <button type="button" className="habit-reveal-link" onClick={() => reveal("duration")} disabled={saving}>
                                        <PlusCircleFill size={12} />
                                        How long will it take?
                                    </button>
                                )}
                                {!revealedOrder.includes("dates") && (
                                    <button type="button" className="habit-reveal-link" onClick={() => reveal("dates")} disabled={saving}>
                                        <PlusCircleFill size={12} />
                                        Set a start date?
                                    </button>
                                )}
                                {revealedOrder.includes("dates") && draft.end_date == null && (
                                    <button type="button" className="habit-reveal-link" onClick={() => set("end_date", draft.start_date ?? new Date().toISOString().slice(0, 10))} disabled={saving}>
                                        <PlusCircleFill size={12} />
                                        Set an end date?
                                    </button>
                                )}
                            </div>

                        </div>

                        <div className="goal-wizard-footer">
                            <button
                                type="button"
                                className="btn btn-brand"
                                onClick={handleSave}
                                disabled={saving}
                            >
                                {saving ? "Saving…" : isEdit ? "Update" : "Save"}
                            </button>
                            <button
                                type="button"
                                className="btn btn-soft"
                                onClick={requestClose}
                                disabled={saving}
                            >
                                Cancel
                            </button>
                            {formError && (
                                <div className="alert alert-danger goal-wizard-inline-error mb-0">
                                    {formError}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
