import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Files, PencilFill, Trash3Fill } from "react-bootstrap-icons";
import { Dropdown } from "react-bootstrap";

import type { ScheduledTaskDataResponse } from "@/api/types";
import { PRIORITY_COLOR, PRIORITY_LABEL, formatDateDisplay, formatTimeDisplay, TimeIcon } from "./ScheduleCard.constants";

import "./ScheduleCard.scss";

// ── Component ────────────────────────────────────────────────────────────────

interface ScheduleCardProps {
    task: ScheduledTaskDataResponse;
    onSelect: () => void;
    onEdit: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
}

export function ScheduleCard({ task, onSelect, onEdit, onDuplicate, onDelete }: ScheduleCardProps) {
    const timeDisplay = formatTimeDisplay(task.preferred_time, task.specific_time);
    const [showCtx, setShowCtx] = useState(false);
    const [ctxPos, setCtxPos] = useState({ x: 0, y: 0 });

    useEffect(() => {
        if (!showCtx) return;
        const close = () => setShowCtx(false);
        window.addEventListener("scroll", close, true);
        return () => window.removeEventListener("scroll", close, true);
    }, [showCtx]);

    function handleContextMenu(e: React.MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        setCtxPos({ x: e.clientX, y: e.clientY });
        setShowCtx(true);
    }

    return (
        <>
            <div
                className="schedule-task-card"
                role="button"
                tabIndex={0}
                onClick={onSelect}
                onContextMenu={handleContextMenu}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
            >
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

            {/* Right-click context menu — zero-size fixed toggle anchors Popper at cursor */}
            <Dropdown show={showCtx} onToggle={open => setShowCtx(open)}>
                <Dropdown.Toggle
                    as="span"
                    bsPrefix=" "
                    style={{
                        position: "fixed",
                        left: ctxPos.x,
                        top: ctxPos.y,
                        width: 0,
                        height: 0,
                        padding: 0,
                        display: "block",
                        pointerEvents: "none",
                    }}
                />
                {createPortal(
                    <Dropdown.Menu className="sc-ctx-menu" popperConfig={{ strategy: "fixed" }}>
                        <Dropdown.Item className="sc-ctx-item" onClick={() => { setShowCtx(false); onEdit(); }}>
                            <PencilFill size={12} /> Edit
                        </Dropdown.Item>
                        <Dropdown.Item className="sc-ctx-item" onClick={() => { setShowCtx(false); onDuplicate(); }}>
                            <Files size={12} /> Duplicate
                        </Dropdown.Item>
                        <Dropdown.Divider />
                        <Dropdown.Item className="sc-ctx-item sc-ctx-item--danger" onClick={() => { setShowCtx(false); onDelete(); }}>
                            <Trash3Fill size={12} /> Delete
                        </Dropdown.Item>
                    </Dropdown.Menu>,
                    document.body,
                )}
            </Dropdown>
        </>
    );
}
