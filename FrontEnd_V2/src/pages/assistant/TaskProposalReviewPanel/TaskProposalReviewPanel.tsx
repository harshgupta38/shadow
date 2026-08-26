import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "react-bootstrap-icons";

import { api } from "@/api";
import { ApiError } from "@/api/client";
import type {
    TaskCreateRequest,
    TaskDataResponse,
    TaskProposal,
    TaskType,
} from "@/api/types";
import { resizeTextareaToMaxLines } from "@/services/textarea-resize.service";

import "@/pages/my_goals/GoalCreationWizard/GoalCreationWizard.scss";
import "@/pages/my_goals/GoalMilestoneWizard/GoalMilestoneWizardPage.scss";
import "@/pages/assistant/RefinedGoalReviewPanel/RefinedGoalReviewPanel.scss";

type PlanMethod = "Daily" | "Weekly" | "Monthly";
const PLANNING_METHODS: PlanMethod[] = ["Daily", "Weekly", "Monthly"];

function methodToFrequencies(method: PlanMethod): Pick<TaskCreateRequest, "frequencies" | "weekly_count" | "monthly_count"> {
    if (method === "Daily")   return { frequencies: ["daily"],   weekly_count: null, monthly_count: null };
    if (method === "Weekly")  return { frequencies: ["weekly"],  weekly_count: 1,    monthly_count: null };
    if (method === "Monthly") return { frequencies: ["monthly"], weekly_count: null, monthly_count: 1    };
    return { frequencies: ["daily"], weekly_count: null, monthly_count: null };
}

function parsePositiveNumber(value: string): number | null {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
}

type TaskFieldKey = "title" | "target_value" | "value_unit" | "planner_target";
type TaskFieldErrors = Partial<Record<TaskFieldKey, string>>;

function validate(
    title: string,
    taskType: TaskType,
    targetValue: string,
    valueUnit: string,
    planningEnabled: boolean,
    plannerTarget: string,
): TaskFieldErrors {
    const errors: TaskFieldErrors = {};

    if (!title.trim()) errors.title = "Title is required.";

    if (taskType === "Numeric") {
        if (!targetValue.trim()) {
            errors.target_value = "Target value is required for numeric tasks.";
        } else if (parsePositiveNumber(targetValue) === null) {
            errors.target_value = "Please enter a valid positive number.";
        }
        if (!valueUnit.trim()) {
            errors.value_unit = "Unit is required for numeric tasks (e.g. pages, hours).";
        }
        if (planningEnabled && parsePositiveNumber(plannerTarget) === null) {
            errors.planner_target = "Planner target must be greater than 0.";
        }
    }

    return errors;
}

function mapServerFieldErrors(fieldErrors: Partial<Record<string, string>>): TaskFieldErrors {
    const mapped: TaskFieldErrors = {};
    if (fieldErrors.title) mapped.title = fieldErrors.title;
    if (fieldErrors.target_value) mapped.target_value = fieldErrors.target_value;
    if (fieldErrors.value_unit) mapped.value_unit = fieldErrors.value_unit;
    if (fieldErrors.planner_target) mapped.planner_target = fieldErrors.planner_target;
    return mapped;
}

interface TaskProposalReviewPanelProps {
    proposal: TaskProposal;
    onClose: () => void;
    onSaved?: (task: TaskDataResponse) => void | Promise<void>;
}

const SLIDE_OUT_DURATION_MS = 220;

export function TaskProposalReviewPanel({ proposal, onClose, onSaved }: TaskProposalReviewPanelProps) {
    const [title, setTitle] = useState(proposal.task.title);
    const [taskType, setTaskType] = useState<TaskType>(proposal.task.task_type);
    const [targetValue, setTargetValue] = useState(
        proposal.task.target_value !== null ? String(proposal.task.target_value) : ""
    );
    const [valueUnit, setValueUnit] = useState(proposal.task.value_unit ?? "");
    const [note, setNote] = useState(proposal.task.note ?? "");

    const [planningEnabled, setPlanningEnabled] = useState(false);
    const [planningMethod, setPlanningMethod] = useState<PlanMethod>("Daily");
    const [plannerTarget, setPlannerTarget] = useState("");

    const noteRef = useRef<HTMLTextAreaElement>(null);

    const [saving, setSaving] = useState(false);
    const [generalError, setGeneralError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<TaskFieldErrors>({});
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

    useEffect(() => {
        if (noteRef.current) resizeTextareaToMaxLines(noteRef.current, 5);
    }, [note]);

    function clearFieldError(key: TaskFieldKey) {
        setFieldErrors(prev => {
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });
        setGeneralError(null);
    }

    function resetPlanning() {
        setPlanningEnabled(false);
        setPlanningMethod("Daily");
        setPlannerTarget("");
        setFieldErrors(prev => {
            const next = { ...prev };
            delete next.planner_target;
            return next;
        });
    }

    function handleTaskTypeChange(newType: TaskType) {
        setTaskType(newType);
        if (newType === "Binary") {
            setTargetValue("");
            setValueUnit("");
            resetPlanning();
            setFieldErrors(prev => {
                const next = { ...prev };
                delete next.target_value;
                delete next.value_unit;
                return next;
            });
        }
        setGeneralError(null);
    }

    async function handleSave() {
        const trimmedTitle = title.trim();
        const trimmedUnit = valueUnit.trim();

        const errors = validate(trimmedTitle, taskType, targetValue, trimmedUnit, planningEnabled, plannerTarget);
        if (Object.keys(errors).length > 0) {
            setFieldErrors(errors);
            return;
        }

        const isNumeric = taskType === "Numeric";
        const isNumericWithPlanning = isNumeric && planningEnabled;
        const freqFields = isNumericWithPlanning ? methodToFrequencies(planningMethod) : { frequencies: [], weekly_count: null, monthly_count: null };

        const taskPayload: TaskCreateRequest = {
            goal_id: proposal.goal_id!,
            milestone_id: proposal.milestone_id!,
            title: trimmedTitle,
            task_type: taskType,
            current_value: isNumeric ? 0 : null,
            target_value: isNumeric ? parsePositiveNumber(targetValue) : null,
            value_unit: isNumeric ? (trimmedUnit || null) : null,
            planning_enabled: isNumericWithPlanning,
            planner_type: isNumericWithPlanning ? "metric" : "simple",
            planner_target: isNumericWithPlanning ? parsePositiveNumber(plannerTarget) : null,
            ...freqFields,
            priority: "medium",
            preferred_time: "flexible",
            specific_time: null,
            duration_minutes: null,

            specific_days: null,
            day_fallback: false,
            assistant_context: { text: proposal.task.assistant_context },
            note: note.trim() || null,
        };

        setSaving(true);
        setGeneralError(null);
        setFieldErrors({});

        try {
            const task = await api.tasks.saveFromProposal({
                proposal_id: proposal.proposal_id,
                task: taskPayload,
            });
            await onSaved?.(task);
            requestClose();
        } catch (saveError) {
            if (saveError instanceof ApiError) {
                const mapped = mapServerFieldErrors(saveError.fieldErrors ?? {});
                setFieldErrors(mapped);
                setGeneralError(Object.keys(mapped).length === 0 ? saveError.message : null);
            } else {
                setGeneralError("We could not save the task right now. Please try again.");
            }
        } finally {
            setSaving(false);
        }
    }

    const isNumeric = taskType === "Numeric";

    return (
        <div className="goal-refined-review-backdrop">
            <section className={`goal-refined-review-panel${isClosing ? " is-closing" : ""}`} aria-labelledby="task-proposal-review-title">

                <header className="goal-wizard-header p-0">
                    <div className="goal-wizard-header-main w-100">
                        <div className="goal-wizard-header-copy w-100">
                            <h3 id="task-proposal-review-title" className="d-flex align-items-center justify-content-between">
                                Review Task
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-icon goal-wizard-close"
                                    onClick={requestClose}
                                    aria-label="Close task review"
                                    disabled={saving}
                                >
                                    <ChevronRight size={25} />
                                </button>
                            </h3>
                            <p>Your coach has outlined this task. Review it, make any changes if needed, and save it to your milestone.</p>
                        </div>
                    </div>
                </header>

                <div className="goal-wizard-body less-padding">
                    <div className="goal-wizard-review">
                        <div className="goal-wizard-review-form">

                            <div>
                                <label className="form-label" htmlFor="tp-title">Title</label>
                                <input
                                    id="tp-title"
                                    className={`form-control goal-wizard-title-input${fieldErrors.title ? " is-invalid" : ""}`}
                                    value={title}
                                    onChange={e => { setTitle(e.target.value); clearFieldError("title"); }}
                                    disabled={saving}
                                    maxLength={255}
                                />
                                {fieldErrors.title && <div className="invalid-feedback">{fieldErrors.title}</div>}
                            </div>

                            <div>
                                <label className="form-label">Task type</label>
                                <div className="goal-task-type-toggle mt-0">
                                    <button
                                        type="button"
                                        className={`goal-task-type-option${taskType === "Binary" ? " is-active" : ""}`}
                                        onClick={() => handleTaskTypeChange("Binary")}
                                        disabled={saving}
                                    >
                                        <span className="goal-task-type-option-title">Complete it</span>
                                        <span className="goal-task-type-option-subtitle">Mark done when you finish it.</span>
                                    </button>
                                    <button
                                        type="button"
                                        className={`goal-task-type-option${taskType === "Numeric" ? " is-active" : ""}`}
                                        onClick={() => handleTaskTypeChange("Numeric")}
                                        disabled={saving}
                                    >
                                        <span className="goal-task-type-option-title">Track progress</span>
                                        <span className="goal-task-type-option-subtitle">Track progress toward a measurable target.</span>
                                    </button>
                                </div>
                            </div>

                            {isNumeric && (
                                <>
                                    <div className="row g-3">
                                        <div className="col-3">
                                            <label className="form-label" htmlFor="tp-target">Target value</label>
                                            <input
                                                id="tp-target"
                                                type="number"
                                                className={`form-control${fieldErrors.target_value ? " is-invalid" : ""}`}
                                                value={targetValue}
                                                onChange={e => { setTargetValue(e.target.value); clearFieldError("target_value"); }}
                                                placeholder="e.g. 50"
                                                min={1}
                                                step="1"
                                                disabled={saving}
                                            />
                                            {fieldErrors.target_value && <div className="invalid-feedback">{fieldErrors.target_value}</div>}
                                        </div>
                                        <div className="col-9">
                                            <label className="form-label" htmlFor="tp-unit">Unit</label>
                                            <input
                                                id="tp-unit"
                                                className={`form-control${fieldErrors.value_unit ? " is-invalid" : ""}`}
                                                value={valueUnit}
                                                onChange={e => { setValueUnit(e.target.value); clearFieldError("value_unit"); }}
                                                placeholder="e.g. problems, pages, hours"
                                                disabled={saving}
                                                maxLength={64}
                                            />
                                            {fieldErrors.value_unit && <div className="invalid-feedback">{fieldErrors.value_unit}</div>}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="form-label">Add to daily plan?</label>
                                        <div className="goal-task-type-toggle mt-0">
                                            <button
                                                type="button"
                                                className={`goal-task-type-option${planningEnabled ? " is-active" : ""}`}
                                                onClick={() => { setPlanningEnabled(true); setGeneralError(null); }}
                                                disabled={saving}
                                            >
                                                <span className="goal-task-type-option-title">Yes</span>
                                                <span className="goal-task-type-option-subtitle">Include this task in your daily planner.</span>
                                            </button>
                                            <button
                                                type="button"
                                                className={`goal-task-type-option${!planningEnabled ? " is-active" : ""}`}
                                                onClick={() => { resetPlanning(); setGeneralError(null); }}
                                                disabled={saving}
                                            >
                                                <span className="goal-task-type-option-title">No</span>
                                                <span className="goal-task-type-option-subtitle">Exclude this task from your daily planner.</span>
                                            </button>
                                        </div>
                                    </div>

                                    {planningEnabled && (
                                        <>
                                            <div className="row g-3">
                                                <div className="col-3">
                                                    <label className="form-label" htmlFor="tp-planner-target">Planner target</label>
                                                    <input
                                                        id="tp-planner-target"
                                                        type="number"
                                                        className={`form-control${fieldErrors.planner_target ? " is-invalid" : ""}`}
                                                        value={plannerTarget}
                                                        onChange={e => { setPlannerTarget(e.target.value); clearFieldError("planner_target"); }}
                                                        placeholder="1"
                                                        min={1}
                                                        step="1"
                                                        disabled={saving}
                                                    />
                                                    {fieldErrors.planner_target && <div className="invalid-feedback">{fieldErrors.planner_target}</div>}
                                                </div>
                                                <div className="col-9">
                                                    <label className="form-label" htmlFor="tp-planning-method">Method</label>
                                                    <select
                                                        id="tp-planning-method"
                                                        className="form-select"
                                                        value={planningMethod}
                                                        onChange={e => setPlanningMethod(e.target.value as PlanMethod)}
                                                        disabled={saving}
                                                    >
                                                        {PLANNING_METHODS.map(m => (
                                                            <option key={m} value={m}>{m}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>

                                            {parsePositiveNumber(plannerTarget) !== null && valueUnit.trim() && (
                                                <p className="text-muted small mb-0">
                                                    Plan to complete {plannerTarget} {valueUnit} every
                                                    {planningMethod === "Daily" ? " day" : planningMethod === "Weekly" ? " week" : " month"}.
                                                </p>
                                            )}
                                        </>
                                    )}
                                </>
                            )}

                            <div>
                                <label className="form-label" htmlFor="tp-note">Note (optional)</label>
                                <textarea
                                    id="tp-note"
                                    ref={noteRef}
                                    className="form-control goal-wizard-reason"
                                    placeholder="Add a short note about this task..."
                                    value={note}
                                    onChange={e => {
                                        setNote(e.target.value);
                                        resizeTextareaToMaxLines(e.currentTarget, 5);
                                    }}
                                    disabled={saving}
                                    maxLength={500}
                                />
                            </div>

                        </div>

                        <div className="goal-wizard-footer">
                            <button
                                type="button"
                                className="btn btn-brand"
                                onClick={() => void handleSave()}
                                disabled={saving}
                            >
                                {saving ? "Saving..." : "Save"}
                            </button>
                            <button
                                type="button"
                                className="btn btn-soft"
                                onClick={requestClose}
                                disabled={saving}
                            >
                                Cancel
                            </button>
                            {generalError && (
                                <div className="alert alert-danger goal-wizard-inline-error mb-0">{generalError}</div>
                            )}
                        </div>
                    </div>
                </div>

            </section>
        </div>
    );
}
