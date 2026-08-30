import { createPortal } from "react-dom";
import { ArrowLeft, Files, PencilFill, ThreeDotsVertical, Trash3Fill } from "react-bootstrap-icons";
import { Dropdown } from "react-bootstrap";

import type { ScheduledTaskDataResponse } from "@/api/types";
import { todayIso } from "@/services/date.service";
import {
    formatDateDisplay,
    formatTimeDisplay,
    PRIORITY_COLOR,
    PRIORITY_LABEL,
    STATUS_LABEL,
    TimeIcon,
} from "../ScheduleCard/ScheduleCard.constants";
import "./ScheduleTaskDetail.scss";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScheduleTaskDetailProps {
    task: ScheduledTaskDataResponse;
    onClose: () => void;
    onEdit: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ScheduleTaskDetail({ task, onClose, onEdit, onDuplicate, onDelete }: ScheduleTaskDetailProps) {
    const timeDisplay = formatTimeDisplay(task.preferred_time, task.specific_time);

    return (
        <div className="std-panel">
            {/* Top bar */}
            <div className="std-topbar">
                <button type="button" className="std-icon-btn" onClick={onClose} aria-label="Back to calendar">
                    <ArrowLeft size={16} />
                </button>
                <span className="std-topbar-title">{task.title}</span>
                <Dropdown align="end">
                    <Dropdown.Toggle as="button" type="button" className="std-icon-btn" aria-label="Task actions" bsPrefix=" ">
                        <ThreeDotsVertical size={15} />
                    </Dropdown.Toggle>
                    {createPortal(
                        <Dropdown.Menu className="std-action-menu" popperConfig={{ strategy: "fixed" }}>
                            <Dropdown.Item className="std-action-item" onClick={onEdit}>
                                <PencilFill size={12} /> Edit
                            </Dropdown.Item>
                            <Dropdown.Item className="std-action-item" onClick={onDuplicate}>
                                <Files size={13} /> Duplicate
                            </Dropdown.Item>
                            <Dropdown.Divider />
                            <Dropdown.Item className="std-action-item std-action-item--danger" onClick={onDelete}>
                                <Trash3Fill size={12} /> Delete
                            </Dropdown.Item>
                        </Dropdown.Menu>,
                        document.body,
                    )}
                </Dropdown>
            </div>

            {/* Body */}
            <div className="std-body">
                <div className="std-rows">
                    {/* Left column */}
                    <div className="std-col one">
                        <div className="std-row">
                            <span className="std-row-label">Priority</span>
                            <span className="std-row-value" style={{ color: PRIORITY_COLOR[task.priority] }}>
                                {PRIORITY_LABEL[task.priority]}
                            </span>
                        </div>
                        <div className="std-row">
                            <span className="std-row-label">Date</span>
                            <span className="std-row-value">{formatDateDisplay(task.scheduled_date)}</span>
                        </div>
                        <div className="std-row">
                            <span className="std-row-label">Time</span>
                            <span className="std-row-value">
                                {task.preferred_time === "flexible" ? (
                                    "Flexible"
                                ) : (
                                    <><TimeIcon preferredTime={task.preferred_time} />{timeDisplay}</>
                                )}
                            </span>
                        </div>
                        {task.planner_type === "metric" && task.planner_target !== null && (
                            <div className="std-row">
                                <span className="std-row-label">Target</span>
                                <span className="std-row-value">
                                    {task.planner_target}{task.value_unit ? ` ${task.value_unit}` : ""}
                                </span>
                            </div>
                        )}
                        <div className="std-row">
                            <span className="std-row-label">Status</span>
                            <span className={`std-status-badge std-status-badge--${task.status}`}>
                                {task.status === "upcoming" && task.scheduled_date === todayIso()
                                    ? "Due Today"
                                    : STATUS_LABEL[task.status]}
                            </span>
                        </div>
                    </div>

                    {/* Right column */}
                    <div className="std-col two">
                        {!!task.duration_minutes && (
                            <div className="std-row">
                                <span className="std-row-label">Duration</span>
                                <span className="std-row-value">
                                    {task.duration_minutes} {task.duration_minutes === 1 ? "minute" : "minutes"}
                                </span>
                            </div>
                        )}
                        {task.allow_snoozing && (
                            <div className="std-row">
                                <span className="std-row-label">Snoozing</span>
                                <span className="std-row-value">
                                    {task.snooze_limit === null ? "Until Done" : `Up to ${task.snooze_limit} ${task.snooze_limit === 1 ? "time" : "times"}`}
                                </span>
                            </div>
                        )}
                        {task.category && (
                            <div className="std-row">
                                <span className="std-row-label">Category</span>
                                <span className="std-row-value">{task.category}</span>
                            </div>
                        )}
                        {task.goal && (
                            <div className="std-row">
                                <span className="std-row-label">Goal</span>
                                <span className="std-row-value">{task.goal.title}</span>
                            </div>
                        )}
                    </div>
                </div>

                {task.note && (
                    <div className="std-row">
                        <span className="std-row-label">Note</span>
                        <span className="std-row-value">{task.note}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
