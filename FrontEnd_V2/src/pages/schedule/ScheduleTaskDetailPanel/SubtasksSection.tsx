import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckLg, PencilFill, Plus, Trash3Fill, X } from "react-bootstrap-icons";

import { api, ApiError } from "@/api";
import type { SubtaskResponse, SubtaskPlannerMode } from "@/api/types";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { formatDisplayDate, formatDisplayDateShort } from "@/services/date.service";
import { resizeTextareaToMaxLines } from "@/services/textarea-resize.service";
import { useDateFormat } from "@/context/PlannerContext";
import { useToast } from "@/context/ToastContext";

interface SubtasksSectionProps {
    taskId: number;
    minDate: string; // YYYY-MM-DD — task start
    maxDate: string; // YYYY-MM-DD — task end
    onSubtasksChanged?: () => void;
}

interface FormState {
    date: string;
    text: string;
    plannerMode: SubtaskPlannerMode; // always set — mandatory
}

const PLANNER_MODE_LABEL: Record<SubtaskPlannerMode, string> = {
    task: "Action item",
    highlight: "Just highlight",
};

export function SubtasksSection({ taskId, minDate, maxDate, onSubtasksChanged }: SubtasksSectionProps) {
    const dateFormat = useDateFormat();
    const toast = useToast();
    const [subtasks, setSubtasks] = useState<SubtaskResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState<FormState>({ date: minDate, text: "", plannerMode: "highlight" });
    const [editingId, setEditingId] = useState<number | null>(null);
    const [saving, setSaving] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const textRef = useRef<HTMLTextAreaElement>(null);
    const dateInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        let alive = true;
        api.schedule.getSubtasks(taskId).then(data => {
            if (alive) { setSubtasks(data); setLoading(false); }
        }).catch(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [taskId]);

    useEffect(() => {
        if (showForm && textRef.current) {
            textRef.current.focus();
            resizeTextareaToMaxLines(textRef.current, 5);
        }
    }, [showForm]);

    function openAddForm() {
        setEditingId(null);
        setForm({ date: minDate, text: "", plannerMode: "highlight" });
        setError(null);
        setShowForm(true);
    }

    function openEditForm(subtask: SubtaskResponse) {
        setEditingId(subtask.id);
        setForm({ date: subtask.subtask_date, text: subtask.description, plannerMode: subtask.planner_mode ?? "highlight" });
        setError(null);
        setShowForm(true);
    }

    function cancelForm() {
        setShowForm(false);
        setEditingId(null);
        setError(null);
    }

    async function handleSave() {
        const trimmed = form.text.trim();
        if (!trimmed) { setError("Please add a description."); return; }
        setSaving(true);
        setError(null);
        try {
            if (editingId !== null) {
                const updated = await api.schedule.updateSubtask(taskId, editingId, {
                    description: trimmed,
                    planner_mode: form.plannerMode,
                });
                setSubtasks(prev => prev.map(s => s.id === editingId ? updated : s));
            } else {
                const created = await api.schedule.createSubtask(taskId, {
                    subtask_date: form.date,
                    description: trimmed,
                    planner_mode: form.plannerMode,
                });
                setSubtasks(prev => [...prev, created].sort((a, b) =>
                    a.subtask_date < b.subtask_date ? -1 : a.subtask_date > b.subtask_date ? 1 : a.id - b.id,
                ));
            }
            setShowForm(false);
            setEditingId(null);
            onSubtasksChanged?.();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : "Something went wrong.");
        } finally {
            setSaving(false);
        }
    }

    async function confirmDelete() {
        if (deleteTarget === null) return;
        setDeletingId(deleteTarget);
        try {
            await api.schedule.deleteSubtask(taskId, deleteTarget);
            setSubtasks(prev => prev.filter(s => s.id !== deleteTarget));
            setDeleteTarget(null);
            onSubtasksChanged?.();
        } catch {
            toast.error("Failed to delete sub-task.");
            setDeleteTarget(null);
        } finally {
            setDeletingId(null);
        }
    }

    const canSave = form.text.trim().length > 0;

    return (
        <>
        {createPortal(
            <ConfirmDialog
                show={deleteTarget !== null}
                title="Delete sub-task?"
                message="This sub-task will be permanently removed."
                confirmLabel="Delete"
                destructive
                busy={deletingId !== null}
                onConfirm={() => void confirmDelete()}
                onCancel={() => setDeleteTarget(null)}
            />,
            document.body,
        )}
        <div className="subtask-section">
            <div className="subtask-header">
                <span className="stdp-label" style={{ width: "auto" }}>Sub-tasks</span>
                {!showForm && (
                    <button
                        type="button"
                        className="btn subtask-add-btn"
                        onClick={openAddForm}
                        aria-label="Add sub-task"
                    >
                        <Plus size={15} />
                    </button>
                )}
            </div>

            {loading && (
                <p className="subtask-empty">Loading…</p>
            )}

            {!loading && subtasks.length === 0 && !showForm && (
                <p className="subtask-empty">No sub-tasks yet. Add one for any date in this task.</p>
            )}

            {subtasks.length > 0 && (
                <ul className="subtask-list">
                    {subtasks.map(subtask => (
                        <li key={subtask.id} className={`subtask-item${editingId === subtask.id ? " subtask-item--editing" : ""}`}>
                            <span className="subtask-date-pill">
                                {formatDisplayDateShort(subtask.subtask_date, dateFormat)}
                            </span>
                            <span className="subtask-text">{subtask.description}</span>
                            {subtask.planner_mode && (
                                <span
                                    className={`subtask-mode-dot subtask-mode-dot--${subtask.planner_mode}`}
                                    title={PLANNER_MODE_LABEL[subtask.planner_mode]}
                                />
                            )}
                            <span className="subtask-actions">
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-icon subtask-action-btn"
                                    onClick={() => openEditForm(subtask)}
                                    disabled={deletingId === subtask.id}
                                    aria-label="Edit sub-task"
                                >
                                    <PencilFill size={11} />
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-icon subtask-action-btn subtask-action-btn--delete"
                                    onClick={() => setDeleteTarget(subtask.id)}
                                    disabled={deletingId === subtask.id}
                                    aria-label="Delete sub-task"
                                >
                                    <Trash3Fill size={11} />
                                </button>
                            </span>
                        </li>
                    ))}
                </ul>
            )}

            {showForm && (
                <div className="subtask-form">
                    {/* Date + actions row */}
                    <div className="subtask-form-top">
                        <div
                            className={`form-control form-control-sm subtask-date-display${editingId !== null ? " disabled" : ""}`}
                            role="button"
                            tabIndex={editingId !== null ? -1 : 0}
                            onClick={() => { if (editingId === null) dateInputRef.current?.showPicker(); }}
                            onKeyDown={e => { if ((e.key === "Enter" || e.key === " ") && editingId === null) dateInputRef.current?.showPicker(); }}
                            aria-label="Open date picker"
                        >
                            {form.date
                                ? formatDisplayDate(form.date, dateFormat)
                                : <span className="schedule-date-placeholder">Pick a date</span>
                            }
                            <input
                                ref={dateInputRef}
                                type="date"
                                value={form.date}
                                min={minDate}
                                max={maxDate}
                                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                                disabled={editingId !== null}
                                className="schedule-date-hidden-input"
                                tabIndex={-1}
                                aria-hidden="true"
                            />
                        </div>
                        <button
                            type="button"
                            className="btn subtask-save-btn"
                            onClick={() => void handleSave()}
                            disabled={saving || !canSave}
                            aria-label="Save sub-task"
                        >
                            <CheckLg size={15} />
                        </button>
                        <button
                            type="button"
                            className="btn subtask-cancel-btn"
                            onClick={cancelForm}
                            disabled={saving}
                            aria-label="Cancel"
                        >
                            <X size={15} />
                        </button>
                    </div>

                    <textarea
                        ref={textRef}
                        className="form-control form-control-sm subtask-textarea"
                        rows={1}
                        maxLength={200}
                        placeholder="Describe this sub-task…"
                        value={form.text}
                        onChange={e => {
                            setForm(f => ({ ...f, text: e.target.value }));
                            if (textRef.current) resizeTextareaToMaxLines(textRef.current, 5);
                        }}
                    />

                    {/* Mode switch — mandatory, default highlight */}
                    <div className="goal-task-type-toggle goal-task-type-toggle--compact mt-0">
                        <button
                            type="button"
                            className={`goal-task-type-option${form.plannerMode === "task" ? " is-active" : ""}`}
                            onClick={() => setForm(f => ({ ...f, plannerMode: "task" }))}
                        >
                            <span className="goal-task-type-option-title">Action item</span>
                        </button>
                        <button
                            type="button"
                            className={`goal-task-type-option${form.plannerMode === "highlight" ? " is-active" : ""}`}
                            onClick={() => setForm(f => ({ ...f, plannerMode: "highlight" }))}
                        >
                            <span className="goal-task-type-option-title">Just highlight</span>
                        </button>
                    </div>

                    {error && <p className="subtask-error">{error}</p>}
                </div>
            )}
        </div>
        </>
    );
}
