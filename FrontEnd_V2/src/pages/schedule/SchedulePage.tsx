import { useEffect, useMemo, useState } from "react";
import { CalendarWeek, ChevronDoubleLeft, ChevronDoubleRight, ChevronLeft, ChevronRight, PlusLg } from "react-bootstrap-icons";
import { useNavigate } from "react-router-dom";

import { api } from "@/api";
import type { ScheduledTaskDataResponse, ScheduledTaskPreferredTime, ScheduledTaskPriority, ScheduledTaskStatus } from "@/api/types";
import {
    buildCalendarCells,
    DEFAULT_FILTERS,
    MONTH_NAMES,
    DAY_NAMES,
    PRIORITY_FILTER_OPTIONS,
    STATUS_FILTER_OPTIONS,
    TIME_FILTER_OPTIONS,
} from "@/pages/schedule/SchedulePage.constants";
import type { ScheduleFilterState } from "@/pages/schedule/SchedulePage.constants";
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

// ── Skeleton ─────────────────────────────────────────────────────────────────

function ScheduleCardSkeleton() {
    return (
        <div className="schedule-task-card sch-skel-card" aria-hidden="true">
            <div className="schedule-task-body">
                <div className="schedule-task-title-row">
                    <div className="sch-skel sch-skel-title" />
                    <div className="sch-skel sch-skel-priority" />
                </div>
                <div className="schedule-task-meta mt-2">
                    <div className="sch-skel sch-skel-date" />
                    <div className="sch-skel sch-skel-time" />
                </div>
                <div className="sch-skel sch-skel-date mt-2 w-75"></div>
            </div>
        </div>
    );
}

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
        setLoading(true);
        setSelectedTask(null);
        void api.schedule.getScheduleList(calYear, calMonth + 1)
            .then(setTasks)
            .catch(() => toast.error("Failed to load scheduled tasks."))
            .finally(() => setLoading(false));
    }, [calYear, calMonth]); // eslint-disable-line react-hooks/exhaustive-deps

    function handleDuplicate(task: ScheduledTaskDataResponse) {
        navigate(ROUTES.SCHEDULE_CREATE, { state: { draft: task } });
    }

    async function handleDelete() {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await api.schedule.removeScheduleTask(deleteTarget.id, deleteTarget.repeat_yearly);
            setTasks(prev => prev.filter(t => !(t.id === deleteTarget.id && t.repeat_yearly === deleteTarget.repeat_yearly)));
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
        if (filters.priority.length     && !filters.priority.includes(t.priority))             return false;
        if (filters.preferredTime.length && !filters.preferredTime.includes(t.preferred_time)) return false;
        if (filters.status.length        && !filters.status.includes(t.status))                return false;
        return true;
    }), [tasks, filters]);

    const tasksByDate = useMemo(() => tasks.reduce<Record<string, ScheduledTaskDataResponse[]>>((acc, t) => {
        if (!acc[t.scheduled_date]) acc[t.scheduled_date] = [];
        acc[t.scheduled_date].push(t);
        return acc;
    }, {}), [tasks]);

    const calCells = useMemo(() => buildCalendarCells(calYear, calMonth), [calYear, calMonth]);

    function prevMonth() {
        if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
        else setCalMonth(m => m - 1);
    }
    function nextMonth() {
        if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
        else setCalMonth(m => m + 1);
    }
    function prevYear() { setCalYear(y => y - 1); }
    function nextYear() { setCalYear(y => y + 1); }

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
                                    key: "status",
                                    label: "Status",
                                    options: STATUS_FILTER_OPTIONS,
                                    selected: filters.status,
                                    onToggle: v => setFilters(prev => ({
                                        ...prev,
                                        status: prev.status.includes(v as ScheduledTaskStatus)
                                            ? prev.status.filter(s => s !== v)
                                            : [...prev.status, v as ScheduledTaskStatus],
                                    })),
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
                            Array.from({ length: 5 }, (_, i) => <ScheduleCardSkeleton key={i} />)
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
                                key={`${task.repeat_yearly ? "y" : "n"}-${task.id}`}
                                task={task}
                                onSelect={() => setSelectedTask(task)}
                                onEdit={() => navigate(ROUTES.SCHEDULE_EDIT.replace(":taskId", String(task.id)) + (task.repeat_yearly ? "?yearly=1" : ""), { state: { task } })}
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
                                    ROUTES.SCHEDULE_EDIT.replace(":taskId", String(selectedTask.id)) + (selectedTask.repeat_yearly ? "?yearly=1" : ""),
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
                            <button type="button" className="btn btn-ghost btn-icon border-0" onClick={prevYear} aria-label="Previous year">
                                <ChevronDoubleLeft size={16} />
                            </button>
                            <button type="button" className="btn btn-ghost btn-icon border-0" onClick={prevMonth} aria-label="Previous month">
                                <ChevronLeft size={16} />
                            </button>
                            <span className="schedule-cal-month-label">
                                {MONTH_NAMES[calMonth]} {calYear}
                            </span>
                            <button type="button" className="btn btn-ghost btn-icon border-0" onClick={nextMonth} aria-label="Next month">
                                <ChevronRight size={16} />
                            </button>
                            <button type="button" className="btn btn-ghost btn-icon border-0" onClick={nextYear} aria-label="Next year">
                                <ChevronDoubleRight size={16} />
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
                                const cellTaskLimit = selectedTask ? 1 : 2;
                                return (
                                    <div
                                        key={i}
                                        className={[
                                            "schedule-cal-cell",
                                            !cell.isCurrentMonth && "is-outside",
                                            isToday && "is-today",
                                            cell.iso < currentTodayIso && "is-past",
                                        ].filter(Boolean).join(" ")}
                                        role={cell.iso >= currentTodayIso ? "button" : undefined}
                                        tabIndex={cell.iso >= currentTodayIso ? 0 : undefined}
                                        onClick={cell.iso >= currentTodayIso ? () => navigate(ROUTES.SCHEDULE_CREATE, { state: { date: cell.iso } }) : undefined}
                                        onKeyDown={cell.iso >= currentTodayIso ? (e) => { if (e.key === "Enter" || e.key === " ") navigate(ROUTES.SCHEDULE_CREATE, { state: { date: cell.iso } }); } : undefined}
                                    >
                                        <div className={`schedule-cal-day-num${isToday ? " is-today" : ""}`}>
                                            {cell.day}
                                        </div>
                                        <div className="schedule-cal-chips">
                                            {cellTasks.slice(0, cellTaskLimit).map(t => (
                                                <button
                                                    key={`${t.repeat_yearly ? "y" : "n"}-${t.id}`}
                                                    type="button"
                                                    className="schedule-task-chip"
                                                    style={{ "--chip-color": PRIORITY_COLOR[t.priority] } as React.CSSProperties}
                                                    title={t.title}
                                                    onClick={(e) => { e.stopPropagation(); setSelectedTask(t); }}
                                                >
                                                    {t.title}
                                                </button>
                                            ))}
                                            {cellTasks.length > cellTaskLimit && (
                                                <span className="schedule-cal-overflow">+{cellTasks.length - cellTaskLimit} more</span>
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
