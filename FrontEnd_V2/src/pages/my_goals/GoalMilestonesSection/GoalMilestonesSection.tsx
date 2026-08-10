import { useCallback, useEffect, useState } from "react";
import { Dropdown } from "react-bootstrap";
import { CheckLg, ExclamationTriangle, PencilSquare, PlusLg, Stars, ThreeDotsVertical, Trash3, ArrowsAngleContract, ArrowsAngleExpand } from "react-bootstrap-icons";
import { Link } from "react-router-dom";

import { api, type MilestoneResponse, type MilestoneStatus } from "@/api";
import { ApiError } from "@/api/client";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { useToast } from "@/context/ToastContext";
import { ROUTES } from "@/routes/RoutePaths";
import { MilestoneLoadingSkeleton } from "@/pages/my_goals/MilestoneLoadingSkeleton/MilestoneLoadingSkeleton";

import "@/pages/my_goals/GoalMilestonesSection/GoalMilestonesSection.scss";

const STATUS_CYCLE: MilestoneStatus[] = ["Not Started", "In Progress", "Paused", "Completed", "Cancelled"];

const STATUS_CSS: Record<MilestoneStatus, string> = {
    "Not Started": "pill",
    "In Progress": "pill pill-info",
    "Paused": "pill pill-warn",
    "Completed": "pill pill-success",
    "Cancelled": "pill pill-danger",
};

function formatTargetDate(value: string): string {
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) return value;
    return new Date(parsed).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

interface GoalMilestonesSectionProps {
    goalId: number;
}

export function GoalMilestonesSection({ goalId }: GoalMilestonesSectionProps) {
    const toast = useToast();
    const [milestones, setMilestones] = useState<MilestoneResponse[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<number | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
    const [deleteBusy, setDeleteBusy] = useState(false);
    const [expandedMilestoneId, setExpandedMilestoneId] = useState<number | null>(null);

    const newMilestonePath = ROUTES.MY_GOAL_MILESTONE_CREATE.replace(":goalId", String(goalId));

    const loadMilestones = useCallback(async () => {
        setLoading(true);
        setLoadError(null);

        try {
            const data = await api.milestones.getList(goalId);
            setMilestones(data);
        } catch (err) {
            setLoadError(err instanceof ApiError ? err.message : "Couldn't load milestones. Please try again later.");
        } finally {
            setLoading(false);
        }
    }, [goalId]);

    useEffect(() => {
        void loadMilestones();
    }, [loadMilestones]);

    async function setStatus(milestone: MilestoneResponse, status: MilestoneStatus) {
        if (milestone.status === status) return;
        setBusyId(milestone.id);

        // 1. Update UI instantly (before API responds)
        setMilestones((prev) => prev.map((m) => (m.id === milestone.id ? { ...m, status } : m)));
        try {
            // 2. Then hit the API
            const updated = await api.milestones.update(milestone.id, { status });
            // 3. If API succeeds → replace with real server data
            setMilestones((prev) => prev.map((m) => (m.id === milestone.id ? updated : m)));
        } catch (err) {
            // 4. If API fails → roll back to the original milestone object
            setMilestones((prev) => prev.map((m) => (m.id === milestone.id ? milestone : m)));
            toast.error(err instanceof ApiError ? err.message : "Couldn't update status. Please try again later.");
        } finally {
            setBusyId(null);
        }
    }

    async function handleDelete(id: number) {
        setDeleteBusy(true);
        try {
            await api.milestones.remove(id);
            setMilestones((prev) => prev.filter((m) => m.id !== id));
            setConfirmDeleteId(null);
        } catch (err) {
            toast.error(err instanceof ApiError ? err.message : "Couldn't delete milestone. Please try again later.");
        } finally {
            setDeleteBusy(false);
        }
    }

    function toggleMilestoneExpanded(id: number) {
        setExpandedMilestoneId((prev) => (prev === id ? null : id));
    }

    const sorted = [...milestones].sort((a, b) => a.position - b.position || a.id - b.id);
    const completedCount = milestones.filter((m) => m.status === "Completed").length;
    const hasAny = milestones.length > 0;
    const confirmDeleteTarget = milestones.find((m) => m.id === confirmDeleteId) ?? null;

    return (
        <>
            <section className="surface goal-milestones-section" aria-labelledby="goal-milestones-title">
                <header className="goal-milestones-header">
                    <div>
                        <h2 id="goal-milestones-title" className="goal-milestones-title">Milestones</h2>
                        <p className="goal-milestones-subtitle">
                            {hasAny
                                ? `${completedCount} of ${milestones.length} complete`
                                : "Break this goal into concrete steps"}
                        </p>
                    </div>
                    <div className="goal-milestones-actions" aria-label="Milestones actions">
                        <button type="button" className="btn btn-soft btn-sm">
                            <Stars size={14} className="me-1" /> Ask Goal Coach
                        </button>
                        <Link to={newMilestonePath} className="btn btn-brand btn-sm">
                            <PlusLg size={14} className="me-1" /> Set Milestone
                        </Link>
                    </div>
                </header>

                {loading && <MilestoneLoadingSkeleton count={3} />}

                {!loading && loadError && (
                    <div className="goal-milestones-error" role="alert">
                        <div className="goal-milestones-error-icon" aria-hidden="true">
                            <ExclamationTriangle size={22} />
                        </div>
                        <h3 className="goal-milestones-error-title">Couldn't load milestones</h3>
                        <p className="goal-milestones-error-text">{loadError}</p>
                        <button type="button" className="btn btn-soft btn-sm" onClick={() => void loadMilestones()}>
                            Try again
                        </button>
                    </div>
                )}

                {!loading && !loadError && sorted.length === 0 && (
                    <div className="goal-milestones-empty" role="status" aria-live="polite">
                        <div className="goal-milestones-empty-icon" aria-hidden="true">
                            <CheckLg size={22} />
                        </div>
                        <h3 className="goal-milestones-empty-title">No milestones yet</h3>
                        <p className="goal-milestones-empty-text">
                            Add a few concrete steps, or ask the Goal Coach to suggest some.
                        </p>
                    </div>
                )}

                {!loading && !loadError && sorted.length > 0 && (
                    <div className="goal-milestone-list">
                        {sorted.map((milestone, index) => {
                            const completed = milestone.status === "Completed";
                            const busy = busyId === milestone.id;
                            const isExpanded = expandedMilestoneId === milestone.id;
                            const updatePath = ROUTES.MY_GOAL_MILESTONE_UPDATE
                                .replace(":goalId", String(goalId))
                                .replace(":milestoneId", String(milestone.id));

                            return (
                                <div
                                    key={milestone.id}
                                    className={`goal-milestone-item${index > 0 ? " has-separator" : ""}${isExpanded ? " is-expanded" : ""}`}
                                >
                                    <button
                                        type="button"
                                        className={`goal-milestone-check${completed ? " is-done" : ""}`}
                                        disabled={busy}
                                        onClick={() => void setStatus(milestone, completed ? "Not Started" : "Completed")}
                                        aria-label={completed ? "Mark as not completed" : "Mark as completed"}
                                    >
                                        {completed && <CheckLg size={14} />}
                                    </button>

                                    <div className="goal-milestone-body">
                                        <div className="goal-milestone-title-row">
                                            <span className={`goal-milestone-title${completed ? " is-done" : ""}`}>
                                                {milestone.title}
                                            </span>

                                            <div className="goal-milestone-controls">
                                                <Dropdown align="end" className="flex-shrink-0">
                                                    <Dropdown.Toggle
                                                        as="button"
                                                        className="btn p-0 border-0 bg-transparent shadow-none"
                                                        disabled={busy}
                                                        aria-label="Change status"
                                                        bsPrefix=" "
                                                    >
                                                        <span className={STATUS_CSS[milestone.status]}>
                                                            {milestone.status}
                                                        </span>
                                                    </Dropdown.Toggle>
                                                    <Dropdown.Menu>
                                                        {STATUS_CYCLE.map((s) => (
                                                            <Dropdown.Item
                                                                key={s}
                                                                active={milestone.status === s}
                                                                onClick={() => void setStatus(milestone, s)}
                                                            >
                                                                {s}
                                                            </Dropdown.Item>
                                                        ))}
                                                    </Dropdown.Menu>
                                                </Dropdown>

                                                <Dropdown align="end" className="flex-shrink-0">
                                                    <Dropdown.Toggle
                                                        as="button"
                                                        className="btn btn-ghost btn-icon border-0 goal-milestone-menu-btn"
                                                        disabled={busy}
                                                        aria-label="Milestone options"
                                                        bsPrefix=" "
                                                    >
                                                        <ThreeDotsVertical size={16} />
                                                    </Dropdown.Toggle>
                                                    <Dropdown.Menu>
                                                        <Dropdown.Item as={Link} to={updatePath}>
                                                            <PencilSquare size={14} className="me-2" /> Update
                                                        </Dropdown.Item>
                                                        <Dropdown.Item
                                                            className="text-danger"
                                                            onClick={() => setConfirmDeleteId(milestone.id)}
                                                        >
                                                            <Trash3 size={14} className="me-2" /> Delete
                                                        </Dropdown.Item>
                                                        <Dropdown.Item onClick={() => toggleMilestoneExpanded(milestone.id)}>
                                                            {isExpanded
                                                                ? <><ArrowsAngleContract size={14} className="me-2" /> Collapse</>
                                                                : <><ArrowsAngleExpand size={14} className="me-2" /> Expand</>
                                                            }
                                                        </Dropdown.Item>
                                                    </Dropdown.Menu>
                                                </Dropdown>
                                            </div>
                                        </div>

                                        {milestone.reason && (
                                            <p className="goal-milestone-reason">{milestone.reason}</p>
                                        )}

                                        {(milestone.created_by === "Assistant" || milestone.estimated_duration_days !== null || milestone.total_tasks > 0 || milestone.target_date) && (
                                            <div className="goal-milestone-meta">
                                                {milestone.created_by === "Assistant" && (
                                                    <span className="goal-milestone-badge goal-milestone-badge-ai" title="Suggested by Goal Coach">
                                                        Goal Coach
                                                    </span>
                                                )}
                                                {milestone.estimated_duration_days !== null && (
                                                    <span className="pill pill-info">
                                                        Est. {milestone.estimated_duration_days}d
                                                    </span>
                                                )}
                                                {milestone.target_date && (
                                                    <div className="pill pill-warn">
                                                        {formatTargetDate(milestone.target_date)}
                                                    </div>
                                                )}
                                                {milestone.total_tasks > 0 && (
                                                    <span className="goal-milestone-chip">
                                                        {milestone.completed_tasks}/{milestone.total_tasks} tasks
                                                    </span>
                                                )}
                                            </div>
                                        )}

                                        <div className={`goal-milestone-expanded${isExpanded ? " is-expanded" : ""}`}>
                                            <div className="goal-milestone-expanded-inner">
                                                <button
                                                    type="button"
                                                    className="btn btn-ghost btn-icon border-0 goal-milestone-collapse-btn"
                                                    onClick={() => toggleMilestoneExpanded(milestone.id)}
                                                    aria-label="Collapse details"
                                                >
                                                    <ArrowsAngleContract size={14} />
                                                </button>
                                                {milestone.description && (
                                                    <section className="goal-milestone-outline-item">
                                                        <h4 className="goal-milestone-outline-title">Description</h4>
                                                        <div className="goal-milestone-outline-copy" dangerouslySetInnerHTML={{ __html: milestone.description }} />
                                                    </section>
                                                )}
                                                <section className="goal-milestone-outline-item">
                                                    <h4 className="goal-milestone-outline-title">Timeline</h4>
                                                    <ul className="goal-milestone-outline-timeline">
                                                        {milestone.created_at && (
                                                            <li><span className="goal-milestone-timeline-label">Created</span> {formatTargetDate(milestone.created_at)}</li>
                                                        )}
                                                        {milestone.started_at && (
                                                            <li><span className="goal-milestone-timeline-label">Started</span> {formatTargetDate(milestone.started_at)}</li>
                                                        )}
                                                        {milestone.paused_at && (
                                                            <li><span className="goal-milestone-timeline-label">Paused</span> {formatTargetDate(milestone.paused_at)}</li>
                                                        )}
                                                        {milestone.completed_at && (
                                                            <li><span className="goal-milestone-timeline-label">Completed</span> {formatTargetDate(milestone.completed_at)}</li>
                                                        )}
                                                    </ul>
                                                </section>
                                            </div>
                                        </div>

                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            <ConfirmDialog
                show={confirmDeleteId !== null}
                title="Delete this milestone?"
                message={
                    confirmDeleteTarget
                        ? `"${confirmDeleteTarget.title}" will be permanently removed.`
                        : undefined
                }
                confirmLabel="Delete"
                destructive
                busy={deleteBusy}
                onConfirm={() => { if (confirmDeleteId !== null) void handleDelete(confirmDeleteId); }}
                onCancel={() => setConfirmDeleteId(null)}
            />
        </>
    );
}
