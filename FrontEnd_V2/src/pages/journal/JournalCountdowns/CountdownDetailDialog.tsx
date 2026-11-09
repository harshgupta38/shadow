import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "react-bootstrap";
import { CheckLg, PencilFill, Plus, Trash3Fill, ArrowCounterclockwise } from "react-bootstrap-icons";
import { api, ApiError } from "@/api";
import type { CountdownDetailResponse, JournalEntryResponse, ScheduledTaskStatus } from "@/api/types";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { useDateFormat } from "@/context/PlannerContext";
import { formatDisplayDate, todayIso } from "@/services/date.service";
import { MOOD_BY_KEY, hasContent, sanitizeEntryHtml } from "@/pages/journal/JournalTimeline/JournalTimeline.constants";
import { CountdownDateField } from "@/pages/journal/JournalCountdowns/CountdownDateField";
import { CountdownRing } from "@/pages/journal/JournalCountdowns/CountdownRing";
import { colorCss, dayOfCount, isOverdue, ringDisplay } from "@/pages/journal/JournalCountdowns/JournalCountdowns.constants";

const TASK_STATUS: Record<ScheduledTaskStatus, string> = {
    upcoming: "Upcoming",
    completed: "Done",
    snoozed: "Snoozed",
    missed: "Missed",
};

interface CountdownDetailDialogProps {
    countdownId: number | null;
    /** Something the cards show changed (a task, the status), so the list should reload. */
    onChanged: () => void;
    onClose: () => void;
    onEdit: (countdown: CountdownDetailResponse) => void;
    onDeleted: () => void;
    /** Opens a journal day in the editor. */
    onOpenNote: (date: string) => void;
    onWriteNote: (countdownId: number) => void;
}

export function CountdownDetailDialog({ countdownId, onChanged, onClose, onEdit, onDeleted, onOpenNote, onWriteNote }: CountdownDetailDialogProps) {
    const dateFormat = useDateFormat();
    const today = todayIso();
    const [detail, setDetail] = useState<CountdownDetailResponse | null>(null);
    const [notes, setNotes] = useState<JournalEntryResponse[]>([]);
    const [loadError, setLoadError] = useState(false);
    const [busy, setBusy] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [taskTitle, setTaskTitle] = useState("");
    const [taskDate, setTaskDate] = useState("");
    const [taskError, setTaskError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const load = useCallback(async (id: number) => {
        try {
            const [d, n] = await Promise.all([api.countdowns.get(id), api.countdowns.notes(id)]);
            setDetail(d);
            setNotes(n.filter(hasContent));
            setLoadError(false);
        } catch {
            setLoadError(true);
        }
    }, []);

    useEffect(() => {
        setDetail(null);
        setNotes([]);
        setLoadError(false);
        setConfirmDelete(false);
        setTaskTitle("");
        setTaskDate("");
        setTaskError(null);
        setActionError(null);
        if (countdownId !== null) void load(countdownId);
    }, [countdownId, load]);

    // A new task starts on the next day, or on the date itself when that is sooner.
    useEffect(() => {
        if (!detail) return;
        const tomorrow = new Date(`${today}T00:00:00`);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const next = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
        setTaskDate(prev => prev || (next <= detail.target_date ? next : detail.target_date < today ? today : detail.target_date));
    }, [detail, today]);

    const noteHtml = useMemo(() => Object.fromEntries(notes.map(n => [n.entry_date, sanitizeEntryHtml(n.text)])), [notes]);

    async function addTask() {
        if (!detail || taskTitle.trim() === "" || taskDate === "") return;
        setBusy(true);
        setTaskError(null);
        try {
            await api.schedule.save({
                title: taskTitle.trim(),
                planner_type: "simple",
                planner_target: null,
                value_unit: null,
                priority: "medium",
                scheduled_date: taskDate,
                preferred_time: "flexible",
                specific_time: null,
                allow_snoozing: false,
                snooze_limit: null,
                duration_minutes: null,
                note: null,
                category: null,
                goal_id: null,
                countdown_id: detail.id,
            });
            setTaskTitle("");
            await load(detail.id);
            onChanged();
        } catch (e) {
            const apiError = e instanceof ApiError ? e : null;
            setTaskError(Object.values(apiError?.fieldErrors ?? {})[0] ?? apiError?.message ?? "Couldn't add the task.");
        } finally {
            setBusy(false);
        }
    }

    async function setStatus(status: "active" | "achieved") {
        if (!detail) return;
        setBusy(true);
        setActionError(null);
        try {
            setDetail(await api.countdowns.update(detail.id, { status }));
            onChanged();
        } catch (e) {
            setActionError(e instanceof ApiError ? (Object.values(e.fieldErrors ?? {})[0] ?? e.message) : "Couldn't update the countdown.");
        } finally {
            setBusy(false);
        }
    }

    async function remove() {
        if (!detail) return;
        setBusy(true);
        try {
            await api.countdowns.remove(detail.id);
            setConfirmDelete(false);
            onDeleted();
        } catch (e) {
            setConfirmDelete(false);
            setActionError(e instanceof ApiError ? e.message : "Couldn't delete the countdown.");
        } finally {
            setBusy(false);
        }
    }

    const overdue = detail ? isOverdue(detail) : false;
    const ring = detail ? ringDisplay(detail.days_left) : { value: "", caption: "" };
    const dayOf = detail ? dayOfCount(detail) : null;

    return (
        <>
            <Modal show={countdownId !== null && !confirmDelete} onHide={onClose} centered scrollable size="lg" dialogClassName="cd-detail-dialog">
                <Modal.Header closeButton className="border-0 pb-0" />
                <Modal.Body className="pt-0">
                    {loadError && <p className="text-danger mb-0">Couldn't load this countdown.</p>}
                    {!detail && !loadError && <div className="cd-detail-skeleton" aria-hidden="true"><span /><span /><span /></div>}

                    {detail && (
                        <div style={{ "--cd-color": colorCss(detail.color) } as React.CSSProperties}>
                            <div className="cd-detail-head">
                                <span className="cd-detail-emoji" aria-hidden="true">{detail.emoji}</span>
                                <div className="cd-detail-heading">
                                    <h2 className="cd-detail-title">{detail.title}</h2>
                                    <div className="cd-detail-date">
                                        {formatDisplayDate(detail.target_date, dateFormat)}
                                        {detail.status === "achieved" && <span className="cd-detail-badge"><CheckLg size={11} /> Achieved</span>}
                                    </div>
                                </div>
                                <CountdownRing
                                    size={88}
                                    stroke={8}
                                    percent={detail.progress_pct}
                                    value={detail.status === "achieved" ? "Done" : ring.value}
                                    caption={detail.status === "achieved" ? "" : ring.caption}
                                    ariaLabel={`${detail.progress_pct}% of the way there`}
                                />
                            </div>

                            <p className="cd-detail-since">
                                Counting since {formatDisplayDate(detail.start_date, dateFormat)}
                                {dayOf ? ` · ${dayOf}` : ""}
                            </p>

                            {detail.note && <p className="cd-detail-why">{detail.note}</p>}

                            {overdue && (
                                <div className="cd-detail-overdue">
                                    <span>The date has passed. Did it happen?</span>
                                    <button type="button" className="btn btn-brand btn-sm" disabled={busy} onClick={() => void setStatus("achieved")}>
                                        <CheckLg size={13} /> It happened
                                    </button>
                                    <button type="button" className="btn btn-outline-secondary btn-sm" disabled={busy} onClick={() => onEdit(detail)}>
                                        Pick a new date
                                    </button>
                                </div>
                            )}

                            {/* Tasks */}
                            <section className="cd-detail-section">
                                <h3 className="cd-detail-section-title">
                                    Tasks <span className="cd-detail-section-count">{detail.tasks_done}/{detail.tasks_total}</span>
                                </h3>
                                {detail.tasks.length === 0 && <p className="cd-detail-empty">Nothing planned yet. Add the steps that get you there.</p>}
                                {detail.tasks.length > 0 && (
                                    <ul className="cd-task-list">
                                        {detail.tasks.map(t => (
                                            <li key={t.id} className={`cd-task is-${t.status}`}>
                                                <span className="cd-task-check" aria-hidden="true">{t.status === "completed" && <CheckLg size={11} />}</span>
                                                <span className="cd-task-title">{t.title}</span>
                                                <span className="cd-task-date">{formatDisplayDate(t.scheduled_date, dateFormat)}</span>
                                                <span className="cd-task-status">{TASK_STATUS[t.status]}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                {detail.status === "active" && (
                                    <div className="cd-task-add">
                                        <input
                                            className="form-control form-control-sm"
                                            placeholder="Add a task, e.g. Book flights"
                                            maxLength={255}
                                            value={taskTitle}
                                            onChange={e => setTaskTitle(e.target.value)}
                                            onKeyDown={e => { if (e.key === "Enter") void addTask(); }}
                                            aria-label="New task"
                                        />
                                        <CountdownDateField
                                            id="cd-task-date"
                                            className="form-control-sm cd-task-add-date"
                                            value={taskDate}
                                            min={today}
                                            ariaLabel="Task date"
                                            onChange={setTaskDate}
                                        />
                                        <button type="button" className="btn btn-brand btn-sm" disabled={busy || taskTitle.trim() === "" || taskDate === ""} onClick={() => void addTask()}>
                                            <Plus size={16} /> Add
                                        </button>
                                    </div>
                                )}
                                {taskError && <div className="cd-form-error">{taskError}</div>}
                                <p className="cd-detail-hint">Tasks show up on your Schedule and in the plan for their day.</p>
                            </section>

                            {/* Notes */}
                            <section className="cd-detail-section">
                                <h3 className="cd-detail-section-title">
                                    Notes <span className="cd-detail-section-count">{notes.length}</span>
                                    <button type="button" className="btn btn-ghost btn-sm cd-detail-section-action" onClick={() => onWriteNote(detail.id)}>
                                        <PencilFill size={11} /> Write one
                                    </button>
                                </h3>
                                {notes.length === 0 && <p className="cd-detail-empty">No notes yet. Tag a journal day to this countdown and it appears here.</p>}
                                {notes.length > 0 && (
                                    <ol className="cd-note-list">
                                        {notes.map(n => {
                                            const mood = n.mood ? MOOD_BY_KEY[n.mood] : null;
                                            return (
                                                <li key={n.id} className="cd-note">
                                                    <div className="cd-note-head">
                                                        <span className="cd-note-date">{formatDisplayDate(n.entry_date, dateFormat)}</span>
                                                        {mood && <span className="cd-note-mood" title={mood.label}>{mood.emoji}</span>}
                                                        <button type="button" className="btn btn-link btn-sm p-0 ms-auto" onClick={() => onOpenNote(n.entry_date)}>Open in journal</button>
                                                    </div>
                                                    {noteHtml[n.entry_date] && noteHtml[n.entry_date].replace(/<[^>]*>/g, "").trim() !== "" && (
                                                        <div className="cd-note-text" dangerouslySetInnerHTML={{ __html: noteHtml[n.entry_date] }} />
                                                    )}
                                                </li>
                                            );
                                        })}
                                    </ol>
                                )}
                            </section>

                            {actionError && <div className="cd-form-error mt-2">{actionError}</div>}

                            <div className="cd-detail-actions">
                                {detail.status === "active" ? (
                                    !overdue && (
                                        <button type="button" className="btn btn-outline-success btn-sm" disabled={busy} onClick={() => void setStatus("achieved")}>
                                            <CheckLg size={13} /> Mark achieved
                                        </button>
                                    )
                                ) : (
                                    <button type="button" className="btn btn-outline-secondary btn-sm" disabled={busy} onClick={() => void setStatus("active")}>
                                        <ArrowCounterclockwise size={13} /> Reopen
                                    </button>
                                )}
                                <button type="button" className="btn btn-outline-secondary btn-sm ms-auto" disabled={busy} onClick={() => onEdit(detail)}>
                                    <PencilFill size={12} /> Edit
                                </button>
                                <button type="button" className="btn btn-outline-danger btn-sm" disabled={busy} onClick={() => setConfirmDelete(true)}>
                                    <Trash3Fill size={12} /> Delete
                                </button>
                            </div>
                        </div>
                    )}
                </Modal.Body>
            </Modal>

            <ConfirmDialog
                show={confirmDelete}
                title="Delete this countdown?"
                message={detail ? `"${detail.title}" will be removed. Its tasks stay in your Schedule and its notes stay in your journal.` : undefined}
                confirmLabel="Delete"
                destructive
                busy={busy}
                onConfirm={() => void remove()}
                onCancel={() => setConfirmDelete(false)}
            />
        </>
    );
}
