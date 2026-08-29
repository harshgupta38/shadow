import { useEffect, useState } from "react";
import { CalendarWeek, ChevronLeft, ChevronRight, PlusLg } from "react-bootstrap-icons";
import { useNavigate } from "react-router-dom";

import { api } from "@/api";
import type { ScheduledTaskDataResponse } from "@/api/types";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import { useToast } from "@/context/ToastContext";
import { ROUTES } from "@/routes/RoutePaths";
import { todayIso } from "@/services/date.service";
import { ScheduleCard } from "@/pages/schedule/ScheduleCard/ScheduleCard";
import { PRIORITY_COLOR } from "@/pages/schedule/ScheduleCard/ScheduleCard.constants";

import "@/pages/schedule/SchedulePage.scss";

// ── Constants ───────────────────────────────────────────────────────────────

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

// ── Calendar helpers ─────────────────────────────────────────────────────────

interface CalCell {
    iso: string;
    day: number;
    isCurrentMonth: boolean;
}

function calIso(year: number, month: number, day: number): string {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function buildCalendarCells(year: number, month: number): CalCell[] {
    const firstDay = new Date(year, month, 1);
    const startDow = firstDay.getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const cells: CalCell[] = [];

    for (let i = 0; i < startDow; i++) {
        const d = new Date(year, month, i - startDow + 1);
        cells.push({ iso: calIso(d.getFullYear(), d.getMonth(), d.getDate()), day: d.getDate(), isCurrentMonth: false });
    }
    for (let d = 1; d <= totalDays; d++) {
        cells.push({ iso: calIso(year, month, d), day: d, isCurrentMonth: true });
    }
    const remainder = cells.length % 7;
    if (remainder > 0) {
        for (let i = 1; i <= 7 - remainder; i++) {
            const d = new Date(year, month + 1, i);
            cells.push({ iso: calIso(d.getFullYear(), d.getMonth(), d.getDate()), day: d.getDate(), isCurrentMonth: false });
        }
    }
    return cells;
}

// ── Component ────────────────────────────────────────────────────────────────

export function SchedulePage() {
    const navigate = useNavigate();
    const toast = useToast();

    const [loading, setLoading] = useState(true);
    const [tasks, setTasks] = useState<ScheduledTaskDataResponse[]>([]);
    const [deleteTarget, setDeleteTarget] = useState<ScheduledTaskDataResponse | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [calYear, setCalYear] = useState(() => {
        const [y] = todayIso().split("-").map(Number);
        return y;
    });
    const [calMonth, setCalMonth] = useState(() => {
        const [, m] = todayIso().split("-").map(Number);
        return m - 1;
    });

    useEffect(() => {
        void api.schedule.getScheduleList()
            .then(setTasks)
            .catch(() => toast.error("Failed to load scheduled tasks."))
            .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function handleDuplicate(task: ScheduledTaskDataResponse) {
        navigate(ROUTES.SCHEDULE_CREATE, { state: { draft: task } });
    }

    async function handleDelete() {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await api.schedule.removeScheduleTask(deleteTarget.id);
            setTasks(prev => prev.filter(t => t.id !== deleteTarget.id));
            setDeleteTarget(null);
            toast.success("Task deleted.");
        } catch {
            toast.error("Failed to delete task.");
        } finally {
            setDeleting(false);
        }
    }

    const tasksByDate = tasks.reduce<Record<string, ScheduledTaskDataResponse[]>>((acc, t) => {
        const key = t.scheduled_date;
        if (!acc[key]) acc[key] = [];
        acc[key].push(t);
        return acc;
    }, {});

    const calCells = buildCalendarCells(calYear, calMonth);
    const currentTodayIso = todayIso();

    function prevMonth() {
        if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
        else setCalMonth(m => m - 1);
    }
    function nextMonth() {
        if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
        else setCalMonth(m => m + 1);
    }

    return (
        <section className="schedule-page-container">
            <PageHeader
                title="Schedule"
                subtitle="Plan one-time commitments and never lose track of them."
                icon={<CalendarWeek size={20} />}
            />

            <div className="schedule-layout">
                {/* ── Left: task list ──────────────────────────────────── */}
                <div className="surface schedule-tasks-panel">
                    <div className="schedule-panel-head">
                        <span className="schedule-panel-title">Upcoming</span>
                        <button className="btn btn-soft btn-sm" onClick={() => navigate(ROUTES.SCHEDULE_CREATE)}>
                            <PlusLg size={13} className="me-1" /> New
                        </button>
                    </div>

                    <div className="schedule-tasks-list">
                        {loading ? (
                            <div className="schedule-empty-state">
                                <span className="spinner-border spinner-border-sm" aria-hidden="true" />
                            </div>
                        ) : tasks.length === 0 ? (
                            <div className="schedule-empty-state">
                                <CalendarWeek size={28} className="mb-2 schedule-empty-icon" />
                                <p className="small mb-0">No scheduled tasks yet.</p>
                            </div>
                        ) : tasks.map(task => (
                            <ScheduleCard
                                key={task.id}
                                task={task}
                                onEdit={() => navigate(
                                    ROUTES.SCHEDULE_EDIT.replace(":taskId", String(task.id)),
                                    { state: { task } },
                                )}
                                onDuplicate={() => handleDuplicate(task)}
                                onDelete={() => setDeleteTarget(task)}
                            />
                        ))}
                    </div>
                </div>

                {/* ── Right: calendar ──────────────────────────────────── */}
                <div className="surface schedule-cal-panel">
                    <div className="schedule-cal-header">
                        <button type="button" className="btn btn-ghost btn-icon border-0" onClick={prevMonth} aria-label="Previous month">
                            <ChevronLeft size={16} />
                        </button>
                        <span className="schedule-cal-month-label">
                            {MONTH_NAMES[calMonth]} {calYear}
                        </span>
                        <button type="button" className="btn btn-ghost btn-icon border-0" onClick={nextMonth} aria-label="Next month">
                            <ChevronRight size={16} />
                        </button>
                    </div>

                    <div className="schedule-cal-day-names">
                        {DAY_NAMES.map(d => (
                            <div key={d} className="schedule-cal-day-name">{d}</div>
                        ))}
                    </div>

                    <div className="schedule-cal-grid">
                        {calCells.map((cell, i) => {
                            const cellTasks = tasksByDate[cell.iso] ?? [];
                            const isToday = cell.iso === currentTodayIso;
                            return (
                                <div
                                    key={i}
                                    className={[
                                        "schedule-cal-cell",
                                        !cell.isCurrentMonth && "is-outside",
                                        isToday && "is-today",
                                    ].filter(Boolean).join(" ")}
                                >
                                    <div className={`schedule-cal-day-num${isToday ? " is-today" : ""}`}>
                                        {cell.day}
                                    </div>
                                    <div className="schedule-cal-chips">
                                        {cellTasks.slice(0, 3).map(t => (
                                            <button
                                                key={t.id}
                                                type="button"
                                                className="schedule-task-chip"
                                                style={{ "--chip-color": PRIORITY_COLOR[t.priority] } as React.CSSProperties}
                                                title={t.title}
                                                onClick={() => navigate(
                                                    ROUTES.SCHEDULE_EDIT.replace(":taskId", String(t.id)),
                                                    { state: { task: t } },
                                                )}
                                            >
                                                {t.title}
                                            </button>
                                        ))}
                                        {cellTasks.length > 3 && (
                                            <span className="schedule-cal-overflow">+{cellTasks.length - 3} more</span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <ConfirmDialog
                show={deleteTarget !== null}
                title="Delete task?"
                message={`"${deleteTarget?.title}" will be permanently deleted.`}
                confirmLabel="Delete"
                destructive
                busy={deleting}
                onConfirm={handleDelete}
                onCancel={() => !deleting && setDeleteTarget(null)}
            />
        </section>
    );
}
