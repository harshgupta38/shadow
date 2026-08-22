import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "react-bootstrap-icons";
import { SLIDE_OUT_DURATION_MS, FREQUENCY_OPTIONS, PREFERRED_TIME_OPTIONS, PRIORITY_OPTIONS, EMPTY_DRAFT } from "@/pages/habit_library/HabitFormPanel/HabitFormPanel.constants";
import { resizeTextareaToMaxLines } from "@/services/textarea-resize.service";
import { api, ApiError } from "@/api";
import type { HabitDataResponse, HabitCreateRequest } from "@/api";

import "@/pages/my_goals/GoalCreationWizard/GoalCreationWizard.scss";
import "@/pages/my_goals/GoalTaskWizard/GoalTaskWizardPage.scss";
import "@/pages/assistant/RefinedGoalReviewPanel/RefinedGoalReviewPanel.scss";
import "@/pages/habit_library/HabitFormPanel/HabitFormPanel.scss";

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

    function toggleFrequency(value: string) {
        setDraft((prev) => ({
            ...prev,
            frequencies: prev.frequencies.includes(value)
                ? prev.frequencies.filter((f) => f !== value)
                : [...prev.frequencies, value],
        }));
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
        if (draft.start_date && draft.start_date < today) {
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

    return (
        <div className="goal-refined-review-backdrop" onClick={requestClose}>
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
                                    What is the habit?
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

                            {/* Q2 – Why? */}
                            <div>
                                <label className="form-label" htmlFor="habit-panel-motivation">
                                    Why do you want to build this habit?{" "}
                                    <span className="text-muted-2 fw-normal">(optional)</span>
                                </label>
                                <textarea
                                    ref={motivationRef}
                                    id="habit-panel-motivation"
                                    className={`form-control${fieldErrors.motivation ? " is-invalid" : ""}`}
                                    rows={1}
                                    placeholder="Context helps your coach give better suggestions."
                                    value={draft.motivation ?? ""}
                                    disabled={saving}
                                    style={{ overflowY: "hidden", resize: "none" }}
                                    onChange={(e) => {
                                        set("motivation", e.target.value);
                                        resizeTextareaToMaxLines(e.target, 5);
                                    }}
                                />
                            </div>

                            {/* Q3 – How often? */}
                            <div>
                                <span className="form-label d-block mb-2">How often?</span>
                                <div className="d-flex flex-wrap gap-2">
                                    {FREQUENCY_OPTIONS.map((opt) => {
                                        const selected = draft.frequencies.includes(opt.value);
                                        return (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                className={`btn btn-sm ${selected ? "btn-brand" : "btn-outline-secondary"}`}
                                                onClick={() => toggleFrequency(opt.value)}
                                                disabled={saving}
                                            >
                                                {opt.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Q4 – When do you prefer to do it? */}
                            <div>
                                <label className="form-label" htmlFor="habit-panel-time">
                                    When do you prefer to do it?
                                </label>
                                <div className="d-flex gap-2">
                                    <select
                                        id="habit-panel-time"
                                        className={`form-select${fieldErrors.preferred_time ? " is-invalid" : ""}`}
                                        value={draft.preferred_time ?? "flexible"}
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
                                    {draft.preferred_time === "custom" && (
                                        <input
                                            type="time"
                                            className={`form-control${fieldErrors.specific_time ? " is-invalid" : ""}`}
                                            value={draft.specific_time}
                                            disabled={saving}
                                            onChange={(e) => set("specific_time", e.target.value)}
                                            aria-label="Specific time"
                                        />
                                    )}
                                </div>
                            </div>

                            {/* Q5 – How long does it take? */}
                            <div>
                                <label className="form-label" htmlFor="habit-panel-duration">
                                    How long does it take?{" "}
                                    <span className="text-muted-2 fw-normal">(minutes, optional)</span>
                                </label>
                                <input
                                    id="habit-panel-duration"
                                    type="number"
                                    className={`form-control${fieldErrors.duration_minutes ? " is-invalid" : ""}`}
                                    placeholder="e.g. 20"
                                    min={1}
                                    step={1}
                                    value={draft.duration_minutes ?? ""}
                                    disabled={saving}
                                    onChange={(e) => set("duration_minutes", e.target.value === "" ? null : parseInt(e.target.value, 10))}
                                />
                            </div>

                            {/* Q6 – Priority */}
                            <div>
                                <span className="form-label d-block mb-2">Priority</span>
                                <div className="d-flex flex-wrap gap-2">
                                    {PRIORITY_OPTIONS.map((opt) => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            className={`btn btn-sm ${draft.priority === opt.value ? "btn-brand" : "btn-outline-secondary"}`}
                                            onClick={() => set("priority", opt.value)}
                                            disabled={saving}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Q7 + Q8 – Dates row */}
                            <div className="d-flex gap-3">
                                <div className="flex-grow-1">
                                    <label className="form-label" htmlFor="habit-panel-start">
                                        Start date
                                    </label>
                                    <input
                                        id="habit-panel-start"
                                        type="date"
                                        className={`form-control${fieldErrors.start_date ? " is-invalid" : ""}`}
                                        value={draft.start_date ?? ""}
                                        min={new Date().toISOString().slice(0, 10)}
                                        disabled={saving}
                                        onChange={(e) => set("start_date", e.target.value || null)}
                                    />
                                </div>
                                {draft.end_date != null && (
                                    <div className="flex-grow-1">
                                        <label className="form-label" htmlFor="habit-panel-end">
                                            End date
                                        </label>
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

                            {/* Ongoing toggle */}
                            <div className="goal-task-type-toggle">
                                <button
                                    type="button"
                                    className={`goal-task-type-option ${draft.end_date == null ? "is-active" : ""}`.trim()}
                                    onClick={() => set("end_date", null)}
                                    disabled={saving}
                                >
                                    <span className="goal-task-type-option-title">Ongoing</span>
                                    <span className="goal-task-type-option-subtitle">No end date — continue indefinitely.</span>
                                </button>
                                <button
                                    type="button"
                                    className={`goal-task-type-option ${draft.end_date != null ? "is-active" : ""}`.trim()}
                                    onClick={() => set("end_date", new Date().toISOString().slice(0, 10))}
                                    disabled={saving}
                                >
                                    <span className="goal-task-type-option-title">Set end date</span>
                                    <span className="goal-task-type-option-subtitle">Choose when this habit should end.</span>
                                </button>
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
