import type { ScheduledTaskDataResponse } from "@/api/types";
import { PRIORITY_COLOR, PRIORITY_LABEL, formatDateDisplay, formatTimeDisplay, TimeIcon } from "./ScheduleCard.constants";

import "./ScheduleCard.scss";

// ── Component ────────────────────────────────────────────────────────────────

interface ScheduleCardProps {
    task: ScheduledTaskDataResponse;
    onEdit: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
}

export function ScheduleCard({ task }: ScheduleCardProps) {
    const timeDisplay = formatTimeDisplay(task.preferred_time, task.specific_time);

    return (
        <div className="schedule-task-card">
            <div
                className="schedule-task-bar"
                style={{ background: PRIORITY_COLOR[task.priority] }}
            />
            <div className="schedule-task-body">
                {/* Row 1 - title + priority */}
                <div className="schedule-task-title-row">
                    <div className="schedule-task-title">{task.title}</div>
                    <span
                        className="schedule-task-priority"
                        style={{ color: PRIORITY_COLOR[task.priority] }}
                    >
                        {PRIORITY_LABEL[task.priority]}
                    </span>
                </div>

                {/* Row 2 - date (left) · time chip (right) */}
                <div className="schedule-task-meta">
                    <span className="schedule-task-date">
                        {formatDateDisplay(task.scheduled_date)}
                    </span>
                    {timeDisplay && (
                        <span className="schedule-task-time">
                            <TimeIcon preferredTime={task.preferred_time} />
                            {timeDisplay}
                        </span>
                    )}
                </div>

                {/* Row 3 - target (if metric) */}
                {task.planner_type === "metric" && task.planner_target !== null && (
                    <div className="schedule-task-target">
                        Target: {task.planner_target}{task.value_unit ? ` ${task.value_unit}` : ""}
                    </div>
                )}

                {/* Row 4 - note */}
                {task.note && (
                    <div className="schedule-task-note">
                        {task.note}
                    </div>
                )}
            </div>
        </div>
    );
}
