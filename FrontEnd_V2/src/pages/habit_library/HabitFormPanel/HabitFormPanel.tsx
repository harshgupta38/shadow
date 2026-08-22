import { useEffect, useState } from "react";
import { ChevronRight } from "react-bootstrap-icons";
import { SLIDE_OUT_DURATION_MS, FREQUENCY_OPTIONS, PREFERRED_TIME_OPTIONS, EMPTY_DRAFT } from "@/pages/habit_library/HabitFormPanel/HabitFormPanel.constants";
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
    const [isClosing, setIsClosing] = useState(false);

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
    }

    function toggleFrequency(value: string) {
        setDraft((prev) => ({
            ...prev,
            frequencies: prev.frequencies.includes(value)
                ? prev.frequencies.filter((f) => f !== value)
                : [...prev.frequencies, value],
        }));
        setFormError(null);
    }

    function resolvedPreferredTime(): string | null {
        if (draft.preferred_time === "specific") {
            return draft.specific_time.trim() || null;
        }
        if (draft.preferred_time === "flexible") return null;
        return draft.preferred_time;
    }

    async function handleSave() {
        const name = draft.name.trim();
        if (!name) {
            setFormError("Habit name is required.");
            return;
        }
        if (draft.frequencies.length === 0) {
            setFormError("Select at least one frequency.");
            return;
        }

        setSaving(true);
        setFormError(null);

        const durationVal = Number(draft.duration_minutes);
        const payload: HabitCreateRequest = {
            name,
            motivation: draft.motivation?.trim() || null,
            frequencies: [...draft.frequencies],
            preferred_time: resolvedPreferredTime(),
            specific_time: draft.specific_time,
            duration_minutes: Number.isFinite(durationVal) && durationVal > 0 ? durationVal : null,
            start_date: draft.start_date || null,
            end_date: draft.is_ongoing ? null : (draft.end_date || null),
            is_ongoing: draft.is_ongoing,
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
                                    className="form-control"
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
                                    id="habit-panel-motivation"
                                    className="form-control"
                                    rows={3}
                                    placeholder="Context helps your coach give better suggestions."
                                    value={draft.motivation ?? ""}
                                    disabled={saving}
                                    onChange={(e) => set("motivation", e.target.value)}
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
                                <select
                                    id="habit-panel-time"
                                    className="form-select"
                                    value={draft.preferred_time ?? "flexible"}
                                    disabled={saving}
                                    onChange={(e) => set("preferred_time", e.target.value)}
                                >
                                    {PREFERRED_TIME_OPTIONS.map(({ value, label }) => (
                                        <option key={value} value={value}>{label}</option>
                                    ))}
                                </select>
                                {draft.preferred_time === "specific" && (
                                    <input
                                        type="time"
                                        className="form-control mt-2"
                                        value={draft.specific_time}
                                        disabled={saving}
                                        onChange={(e) => set("specific_time", e.target.value)}
                                        aria-label="Specific time"
                                    />
                                )}
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
                                    className="form-control"
                                    placeholder="e.g. 20"
                                    min={1}
                                    step={1}
                                    value={draft.duration_minutes ?? ""}
                                    disabled={saving}
                                    onChange={(e) => set("duration_minutes", e.target.value === "" ? null : parseInt(e.target.value, 10))}
                                />
                            </div>

                            {/* Q6 + Q7 – Dates row */}
                            <div className="d-flex gap-3">
                                <div className="flex-grow-1">
                                    <label className="form-label" htmlFor="habit-panel-start">
                                        Start date
                                    </label>
                                    <input
                                        id="habit-panel-start"
                                        type="date"
                                        className="form-control"
                                        value={draft.start_date ?? ""}
                                        disabled={saving}
                                        onChange={(e) => set("start_date", e.target.value || null)}
                                    />
                                </div>
                                {!draft.is_ongoing && (
                                    <div className="flex-grow-1">
                                        <label className="form-label" htmlFor="habit-panel-end">
                                            End date
                                        </label>
                                        <input
                                            id="habit-panel-end"
                                            type="date"
                                            className="form-control"
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
                                    className={`goal-task-type-option ${draft.is_ongoing ? "is-active" : ""}`.trim()}
                                    onClick={() => set("is_ongoing", true)}
                                    disabled={saving}
                                >
                                    <span className="goal-task-type-option-title">Ongoing</span>
                                    <span className="goal-task-type-option-subtitle">No end date — continue indefinitely.</span>
                                </button>
                                <button
                                    type="button"
                                    className={`goal-task-type-option ${!draft.is_ongoing ? "is-active" : ""}`.trim()}
                                    onClick={() => set("is_ongoing", false)}
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
