import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDownRight, ArrowRepeat, ArrowUpRight, ChevronRight, Clock, DashLg, Files, MoonFill, MoonStarsFill, PencilFill, SunFill, Trash3Fill } from "react-bootstrap-icons";

import type { ScheduledTaskDataResponse, ScheduledTaskPriority } from "@/api/types";
import { todayIso } from "@/services/date.service";
import { formatDateDisplay, formatDateDisplayYearly, PRIORITY_LABEL, STATUS_LABEL } from "@/pages/schedule/ScheduleCard/ScheduleCard.constants";

import "@/pages/my_goals/GoalCreationWizard/GoalCreationWizard.scss";
import "@/pages/assistant/RefinedGoalReviewPanel/RefinedGoalReviewPanel.scss";
import "@/pages/schedule/ScheduleTaskDetailPanel/ScheduleTaskDetailPanel.scss";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m} min`;
    if (m === 0) return `${h} hr`;
    return `${h} hr ${m} min`;
}

function PriorityIcon({ priority }: { priority: ScheduledTaskPriority }) {
    if (priority === "highest" || priority === "high") return <ArrowUpRight size={13} />;
    if (priority === "low" || priority === "lowest") return <ArrowDownRight size={13} />;
    return <DashLg size={13} />;
}

function TimeChip({ preferredTime, specificTime }: { preferredTime: string; specificTime: string | null }) {
    const t = preferredTime.toLowerCase();
    if (t === "flexible") return null;

    let icon: React.ReactNode;
    let mod: string;
    const label = t === "custom"
        ? specificTime ?? ""
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
}

const SLIDE_OUT_MS = 220;

// ── Component ─────────────────────────────────────────────────────────────────

export function ScheduleTaskDetailPanel({ task, onClose, onEdit, onDuplicate, onDelete }: ScheduleTaskDetailPanelProps) {
    const [isClosing, setIsClosing] = useState(false);

    function requestClose() {
        if (isClosing) return;
        setIsClosing(true);
        window.setTimeout(onClose, SLIDE_OUT_MS);
    }

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") requestClose(); };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [isClosing]);

    const isMetric = task.planner_type === "metric";
    const isDueToday = task.status === "upcoming" && task.scheduled_date === todayIso();
    const statusLabel = isDueToday ? "Due Today" : STATUS_LABEL[task.status];
    const dateDisplay = task.repeat_yearly
        ? formatDateDisplayYearly(task.scheduled_date)
        : formatDateDisplay(task.scheduled_date);

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
                                    <PriorityIcon priority={task.priority} />
                                    {PRIORITY_LABEL[task.priority]}
                                </span>
                            </span>
                        </div>
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
                        {task.category && (
                            <div className="stdp-row">
                                <span className="stdp-label">Category</span>
                                <span className="stdp-value">{task.category}</span>
                            </div>
                        )}
                        {task.goal && (
                            <div className="stdp-row">
                                <span className="stdp-label">Goal</span>
                                <span className="stdp-value">{task.goal.title}</span>
                            </div>
                        )}
                    </div>
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
