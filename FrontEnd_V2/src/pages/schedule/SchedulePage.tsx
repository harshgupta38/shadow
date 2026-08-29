import { useEffect, useMemo, useState } from "react";
import { CalendarWeek, ChevronLeft, ChevronRight, PlusLg } from "react-bootstrap-icons";
import { useNavigate } from "react-router-dom";

import { api } from "@/api";
import type { ScheduledTaskDataResponse, ScheduledTaskPreferredTime, ScheduledTaskPriority } from "@/api/types";
import {
    buildCalendarCells,
    DEFAULT_FILTERS,
    MONTH_NAMES,
    DAY_NAMES,
    PRIORITY_FILTER_OPTIONS,
    TIME_FILTER_OPTIONS,
    TIMELINE_OPTIONS,
} from "@/pages/schedule/SchedulePage.constants";
import type { ScheduleFilterState, ScheduleTimeline } from "@/pages/schedule/SchedulePage.constants";
import { FilterDropdown } from "@/components/ui/FilterDropdown/FilterDropdown";
import { ScheduleTaskDetail } from "@/pages/schedule/ScheduleTaskDetail/ScheduleTaskDetail";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import { useToast } from "@/context/ToastContext";
import { ROUTES } from "@/routes/RoutePaths";
import { todayIso } from "@/services/date.service";
import { ScheduleCard } from "@/pages/schedule/ScheduleCard/ScheduleCard";
import { PRIORITY_COLOR } from "@/pages/schedule/ScheduleCard/ScheduleCard.constants";

import "@/pages/schedule/SchedulePage.scss";

// ── Component ────────────────────────────────────────────────────────────────

export function SchedulePage() {
    const navigate = useNavigate();
    const toast = useToast();

    const [loading, setLoading] = useState(true);
    const [tasks, setTasks] = useState<ScheduledTaskDataResponse[]>([]);
    const [deleteTarget, setDeleteTarget] = useState<ScheduledTaskDataResponse | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [filters, setFilters] = useState<ScheduleFilterState>(DEFAULT_FILTERS);
    const [selectedTask, setSelectedTask] = useState<ScheduledTaskDataResponse | null>(null);
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
            setSelectedTask(null);
            toast.success("Task deleted.");
        } catch {
            toast.error("Failed to delete task.");
        } finally {
            setDeleting(false);
        }
    }

    const currentTodayIso = todayIso();

    const filteredTasks = useMemo(() => tasks.filter(t => {
        if (filters.timeline === "upcoming" && t.scheduled_date <  currentTodayIso) return false;
        if (filters.timeline === "past"     && t.scheduled_date >= currentTodayIso) return false;
        if (filters.priority.length     && !filters.priority.includes(t.priority))             return false;
        if (filters.preferredTime.length && !filters.preferredTime.includes(t.preferred_time)) return false;
        return true;
    }), [tasks, filters, currentTodayIso]);

    const tasksByDate = tasks.reduce<Record<string, ScheduledTaskDataResponse[]>>((acc, t) => {
        const key = t.scheduled_date;
        if (!acc[key]) acc[key] = [];
        acc[key].push(t);
        return acc;
    }, {});

    const calCells = buildCalendarCells(calYear, calMonth);

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
                actions={[
                    {
                        key: "new-task",
                        label: "New Task",
                        icon: <PlusLg size={14} />,
                        tone: "brand",
                        onClick: () => navigate(ROUTES.SCHEDULE_CREATE),
                    },
                ]}
            />

            <div className="schedule-layout">
                {/* ── Left: task list ──────────────────────────────────── */}
                <div className="surface schedule-tasks-panel">
                    <div className="schedule-panel-head">
                        <span className="schedule-panel-title">Your Commitments</span>
                        <FilterDropdown
                            sections={[
                                {
                                    key: "timeline",
                                    label: "Show",
                                    options: TIMELINE_OPTIONS,
                                    selected: [filters.timeline],
                                    single: true,
                                    onToggle: v => setFilters(prev => ({ ...prev, timeline: v as ScheduleTimeline })),
                                },
                                {
                                    key: "priority",
                                    label: "Priority",
                                    options: PRIORITY_FILTER_OPTIONS,
                                    selected: filters.priority,
                                    onToggle: v => setFilters(prev => ({
                                        ...prev,
                                        priority: prev.priority.includes(v as ScheduledTaskPriority)
                                            ? prev.priority.filter(p => p !== v)
                                            : [...prev.priority, v as ScheduledTaskPriority],
                                    })),
                                },
                                {
                                    key: "time",
                                    label: "Time",
                                    options: TIME_FILTER_OPTIONS,
                                    selected: filters.preferredTime,
                                    onToggle: v => setFilters(prev => ({
                                        ...prev,
                                        preferredTime: prev.preferredTime.includes(v as ScheduledTaskPreferredTime)
                                            ? prev.preferredTime.filter(t => t !== v)
                                            : [...prev.preferredTime, v as ScheduledTaskPreferredTime],
                                    })),
                                },
                            ]}
                            onReset={() => setFilters(DEFAULT_FILTERS)}
                        />
                    </div>

                    <div className="schedule-tasks-list">
                        {loading ? (
                            <div className="schedule-empty-state">
                                <span className="spinner-border spinner-border-sm" aria-hidden="true" />
                            </div>
                        ) : tasks.length === 0 ? (
                            <div className="schedule-empty-state">
                                <CalendarWeek size={28} className="mb-2 schedule-empty-icon" />
                                <p className="schedule-empty-title">No commitments scheduled yet.</p>
                                <p className="schedule-empty-sub">Schedule a one-time task to keep it on your radar.</p>
                            </div>
                        ) : filteredTasks.length === 0 ? (
                            <div className="schedule-empty-state">
                                <CalendarWeek size={28} className="mb-2 schedule-empty-icon" />
                                <p className="small mb-0">No tasks match the current filters.</p>
                            </div>
                        ) : filteredTasks.map(task => (
                            <ScheduleCard
                                key={task.id}
                                task={task}
                                onSelect={() => setSelectedTask(task)}
                                onEdit={() => navigate(ROUTES.SCHEDULE_EDIT.replace(":taskId", String(task.id)), { state: { task } })}
                                onDuplicate={() => handleDuplicate(task)}
                                onDelete={() => setDeleteTarget(task)}
                            />
                        ))}
                    </div>
                </div>

                {/* ── Right: calendar or task detail ───────────────────── */}
                <div className="surface schedule-cal-panel">
                    {selectedTask && (
                        <ScheduleTaskDetail
                            task={selectedTask}
                            onClose={() => setSelectedTask(null)}
                            onEdit={() => {
                                setSelectedTask(null);
                                navigate(
                                    ROUTES.SCHEDULE_EDIT.replace(":taskId", String(selectedTask.id)),
                                    { state: { task: selectedTask } },
                                );
                            }}
                            onDuplicate={() => {
                                setSelectedTask(null);
                                handleDuplicate(selectedTask);
                            }}
                            onDelete={() => setDeleteTarget(selectedTask)}
                        />
                    )}
                    <div className={`schedule-cal-view${selectedTask ? " schedule-cal-view--compact" : ""}`}>
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
                                            {cellTasks.slice(0, 2).map(t => (
                                                <button
                                                    key={t.id}
                                                    type="button"
                                                    className="schedule-task-chip"
                                                    style={{ "--chip-color": PRIORITY_COLOR[t.priority] } as React.CSSProperties}
                                                    title={t.title}
                                                    onClick={() => setSelectedTask(t)}
                                                >
                                                    {t.title}
                                                </button>
                                            ))}
                                            {cellTasks.length > 2 && (
                                                <span className="schedule-cal-overflow">+{cellTasks.length - 2} more</span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
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
