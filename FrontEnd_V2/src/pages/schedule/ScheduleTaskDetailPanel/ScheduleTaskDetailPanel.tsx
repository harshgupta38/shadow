import { useEffect, useState } from "react";
import { useDateFormat, useTimeFormat } from "@/context/PlannerContext";
import { formatTime } from "@/services/date.service";
import { createPortal } from "react-dom";
import { ArrowRepeat, ChevronRight, Clock, Files, MoonFill, MoonStarsFill, PencilFill, SunFill, Trash3Fill } from "react-bootstrap-icons";

import type { ScheduledTaskDataResponse } from "@/api/types";
import { todayIso, formatDuration } from "@/services/date.service";
import { formatDateDisplay, formatDateDisplayYearly, PRIORITY_LABEL, STATUS_LABEL } from "@/pages/schedule/ScheduleCard/ScheduleCard.constants";
import { CATEGORY_ICONS } from "@/pages/schedule/ScheduleWizard/ScheduleWizard.constants";
import { PriorityIcon } from "@/constant/priority";
import { ANIMATION } from "@/constant/tuning";
import { SubtasksSection } from "@/pages/schedule/ScheduleTaskDetailPanel/SubtasksSection";
import { TaskRangeCalendar } from "@/pages/schedule/ScheduleTaskDetailPanel/TaskRangeCalendar";

import "@/pages/my_goals/GoalCreationWizard/GoalCreationWizard.scss";
import "@/pages/my_goals/GoalTaskWizard/GoalTaskWizardPage.scss";
import "@/pages/assistant/RefinedGoalReviewPanel/RefinedGoalReviewPanel.scss";
import "@/pages/schedule/ScheduleTaskDetailPanel/ScheduleTaskDetailPanel.scss";

const PLANNER_DISPLAY_LABEL: Record<string, string> = {
    task:   "Daily task",
    banner: "Highlighted banner",
    none:   "Day 1 only",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function TimeChip({ preferredTime, specificTime }: { preferredTime: string; specificTime: string | null }) {
    const timeFormat = useTimeFormat();
    const t = preferredTime.toLowerCase();
    if (t === "flexible") return null;
    let icon: React.ReactNode;
    let mod: string;
    const label = t === "custom"
        ? (specificTime ? formatTime(specificTime, timeFormat) : "")
        : t.charAt(0).toUpperCase() + t.slice(1);

    if (t === "morning")        { icon = <SunFill size={12} />;        mod = "stdp-time--morning"; }
    else if (t === "afternoon") { icon = <SunFill size={12} />;        mod = "stdp-time--afternoon"; }
    else if (t === "evening")   { icon = <MoonFill size={11} />;       mod = "stdp-time--evening"; }
    else if (t === "night")     { icon = <MoonStarsFill size={11} />;  mod = "stdp-time--night"; }
    else                        { icon = <Clock size={12} />;          mod = "stdp-time--clock"; }

    return (
        <span className={`stdp-time ${mod}`}>
            {icon}
            {label}
        </span>
    );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScheduleTaskDetailPanelProps {
    task: ScheduledTaskDataResponse;
    onClose: () => void;
    onEdit: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onSubtasksChanged?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ScheduleTaskDetailPanel({ task, onClose, onEdit, onDuplicate, onDelete, onSubtasksChanged }: ScheduleTaskDetailPanelProps) {
    const [isClosing, setIsClosing] = useState(false);
    const [calendarRequestedDate, setCalendarRequestedDate] = useState<string | null>(null);

    function requestClose() {
        if (isClosing) return;
        setIsClosing(true);
        window.setTimeout(onClose, ANIMATION.PANEL_SLIDE_OUT_MS);
    }

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") requestClose(); };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [isClosing]);

    const dateFormat = useDateFormat();
    const isMetric = task.planner_type === "metric";
    const isDueToday = task.status === "upcoming" && task.scheduled_date === todayIso();
    const statusLabel = isDueToday ? "Due Today" : STATUS_LABEL[task.status];
    const dateDisplay = task.repeat_yearly
        ? formatDateDisplayYearly(task.scheduled_date, dateFormat)
        : formatDateDisplay(task.scheduled_date, dateFormat);

    return createPortal(
        <div className="goal-refined-review-backdrop" onClick={requestClose}>
            <section
                className={`goal-refined-review-panel stdp-panel${isClosing ? " is-closing" : ""}`}
                onClick={e => e.stopPropagation()}
            >
                <header className="goal-wizard-header p-0">
                    <div className="goal-wizard-header-main w-100">
                        <div className="goal-wizard-header-copy w-100">
                            <h3 className="d-flex align-items-center justify-content-between">
                                {task.title}
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-icon goal-wizard-close"
                                    onClick={requestClose}
                                    aria-label="Close task detail"
                                >
                                    <ChevronRight size={25} />
                                </button>
                            </h3>
                            {task.note && <p>{task.note}</p>}
                        </div>
                    </div>
                </header>

                <div className="stdp-body">
                    <div className="stdp-rows mt-2">
                        <div className="stdp-row align-items-center">
                            <span className="stdp-label">Priority</span>
                            <span className="stdp-value">
                                <span className={`stdp-priority stdp-priority--${task.priority}`}>
                                    <PriorityIcon priority={task.priority} size={13} />
                                    {PRIORITY_LABEL[task.priority]}
                                </span>
                            </span>
                        </div>
                        {task.task_duration === "long" ? (
                            <>
                                <div className="stdp-row">
                                    <span className="stdp-label">Start</span>
                                    <span className="stdp-value stdp-value--flex">
                                        {formatDateDisplay(task.scheduled_date, dateFormat)}
                                        {task.preferred_time !== "flexible" && (
                                            <TimeChip preferredTime={task.preferred_time} specificTime={task.specific_time} />
                                        )}
                                    </span>
                                </div>
                                {task.end_date && (
                                    <div className="stdp-row">
                                        <span className="stdp-label">End</span>
                                        <span className="stdp-value stdp-value--flex">
                                            {formatDateDisplay(task.end_date, dateFormat)}
                                            {task.end_preferred_time && task.end_preferred_time !== "flexible" && (
                                                <TimeChip preferredTime={task.end_preferred_time} specificTime={task.end_specific_time ?? null} />
                                            )}
                                        </span>
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <div className="stdp-row">
                                    <span className="stdp-label">Date</span>
                                    <span className="stdp-value stdp-value--flex">
                                        {dateDisplay}
                                        {task.repeat_yearly && <ArrowRepeat size={13} className="stdp-repeat-icon" title="Repeats yearly" />}
                                    </span>
                                </div>
                                {task.preferred_time !== "flexible" && (
                                    <div className="stdp-row">
                                        <span className="stdp-label">Time</span>
                                        <span className="stdp-value">
                                            <TimeChip preferredTime={task.preferred_time} specificTime={task.specific_time} />
                                        </span>
                                    </div>
                                )}
                            </>
                        )}
                        {isMetric && task.planner_target !== null && (
                            <div className="stdp-row">
                                <span className="stdp-label">Target</span>
                                <span className="stdp-value">
                                    {task.planner_target.toLocaleString()}{task.value_unit ? ` ${task.value_unit}` : ""}
                                </span>
                            </div>
                        )}
                        <div className="stdp-row">
                            <span className="stdp-label">Status</span>
                            <span className="stdp-value">
                                <span className={`stdp-status-badge stdp-status-badge--${task.status}`}>
                                    {statusLabel}
                                </span>
                            </span>
                        </div>
                        {task.duration_minutes !== null && (
                            <div className="stdp-row">
                                <span className="stdp-label">Duration</span>
                                <span className="stdp-value">{formatDuration(task.duration_minutes)}</span>
                            </div>
                        )}
                        {task.allow_snoozing && (
                            <div className="stdp-row">
                                <span className="stdp-label">Snoozing</span>
                                <span className="stdp-value">
                                    {task.snooze_limit !== null ? `Allowed · max ${task.snooze_limit} times` : "Allowed"}
                                </span>
                            </div>
                        )}
                        {task.task_duration === "long" && task.planner_display && (
                            <div className="stdp-row">
                                <span className="stdp-label">Planner</span>
                                <span className="stdp-value">{PLANNER_DISPLAY_LABEL[task.planner_display] ?? task.planner_display}</span>
                            </div>
                        )}
                        {task.category && (
                            <div className="stdp-row">
                                <span className="stdp-label">Category</span>
                                <span className="stdp-value stdp-value--flex">
                                    <span>{CATEGORY_ICONS[task.category]}</span>
                                    {task.category}
                                </span>
                            </div>
                        )}
                        {task.goal && (
                            <div className="stdp-row">
                                <span className="stdp-label">Goal</span>
                                <span className="stdp-value">{task.goal.title}</span>
                            </div>
                        )}
                    </div>

                    {task.task_duration === "long" && task.end_date && (
                        <>
                            <TaskRangeCalendar
                                startDate={task.scheduled_date}
                                endDate={task.end_date}
                                subtaskDates={task.subtasks.map(s => s.subtask_date)}
                                onDateClick={setCalendarRequestedDate}
                            />
                            <SubtasksSection
                                taskId={task.id}
                                minDate={task.scheduled_date}
                                maxDate={task.end_date}
                                onSubtasksChanged={onSubtasksChanged}
                                requestedDate={calendarRequestedDate}
                                onRequestedDateConsumed={() => setCalendarRequestedDate(null)}
                            />
                        </>
                    )}
                </div>

                <footer className="stdp-footer">
                    <button type="button" className="btn stdp-footer-btn stdp-footer-btn--edit" onClick={onEdit}>
                        <PencilFill size={13} />
                        Edit
                    </button>
                    <button type="button" className="btn stdp-footer-btn stdp-footer-btn--duplicate" onClick={onDuplicate}>
                        <Files size={13} />
                        Duplicate
                    </button>
                    <button type="button" className="btn stdp-footer-btn stdp-footer-btn--delete" onClick={onDelete}>
                        <Trash3Fill size={13} />
                        Delete
                    </button>
                </footer>
            </section>
        </div>,
        document.body,
    );
}
