import { useCallback, useEffect, useState } from "react";
import { Dropdown } from "react-bootstrap";
import { CheckLg, ExclamationTriangle, PencilSquare, PlusLg, Stars, ThreeDotsVertical, Trash3, ArrowsAngleContract, ArrowsAngleExpand, CalendarEvent, ListTask } from "react-bootstrap-icons";
import { Link, useNavigate } from "react-router-dom";

import { api, GoalDataResponse, type MilestoneDataResponse, type MilestoneStatus } from "@/api";
import { ApiError } from "@/api/client";
import { ChoiceDialog } from "@/components/ui/ChoiceDialog/ChoiceDialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { TargetDatePromptDialog } from "@/components/ui/TargetDatePromptDialog/TargetDatePromptDialog";
import { useToast } from "@/context/ToastContext";
import { ROUTES } from "@/routes/RoutePaths";
import { MilestoneLoadingSkeleton } from "@/pages/my_goals/MilestoneLoadingSkeleton/MilestoneLoadingSkeleton";
import { MilestoneTasksList } from "@/pages/my_goals/MilestoneTasksList/MilestoneTasksList";

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
    goal: GoalDataResponse;
}

export function GoalMilestonesSection({ goal }: GoalMilestonesSectionProps) {
    const goalId = goal.id;
    const goalTitle = goal.title;
    const sourceConversationId = goal.source_conversation_id;

    const navigate = useNavigate();
    const toast = useToast();
    const [milestones, setMilestones] = useState<MilestoneDataResponse[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<number | null>(null);
    const [confirmUpdateId, setConfirmUpdateId] = useState<number | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
    const [deleteBusy, setDeleteBusy] = useState(false);
    const [expandedMilestoneId, setExpandedMilestoneId] = useState<number | null>(null);
    const [targetDatePromptBusy, setTargetDatePromptBusy] = useState(false);
    const [pendingTargetDatePrompt, setPendingTargetDatePrompt] = useState<{
        milestoneId: number;
        initialTargetDate: string | null;
        allowSkipTargetDate: boolean;
    } | null>(null);
    const [pendingCoachAction, setPendingCoachAction] = useState<{
        autoMessage: string;
        goal_id: number;
        milestone_id?: number;
    } | null>(null);

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

    async function setStatus(milestone: MilestoneDataResponse, status: MilestoneStatus): Promise<boolean> {
        if (milestone.status === status) return false;
        setBusyId(milestone.id);

        // 1. Update UI instantly (before API responds)
        setMilestones((prev) => prev.map((m) => (m.id === milestone.id ? { ...m, status } : m)));
        try {
            // 2. Then hit the API
            const updated = await api.milestones.update(milestone.id, { status });
            // 3. If API succeeds → replace with real server data
            setMilestones((prev) => prev.map((m) => (m.id === milestone.id ? updated : m)));
            return true;
        } catch (err) {
            // 4. If API fails → roll back to the original milestone object
            setMilestones((prev) => prev.map((m) => (m.id === milestone.id ? milestone : m)));
            toast.error(err instanceof ApiError ? err.message : "Couldn't update status. Please try again later.");
            return false;
        } finally {
            setBusyId(null);
        }
    }

    async function requestStatusChange(milestone: MilestoneDataResponse, status: MilestoneStatus) {
        if (milestone.status === status) return;

        const shouldPromptForTargetDate = (
            milestone.status === "Not Started"
            && status === "In Progress"
            && milestone.target_date !== null
        );

        const statusUpdated = await setStatus(milestone, status);
        if (statusUpdated && shouldPromptForTargetDate) {
            setPendingTargetDatePrompt({
                milestoneId: milestone.id,
                initialTargetDate: milestone.target_date,
                allowSkipTargetDate: true,
            });
        }
    }

    async function updatePendingTargetDate(targetDate: string | null) {
        if (!pendingTargetDatePrompt) return;
        const milestone = milestones.find((m) => m.id === pendingTargetDatePrompt.milestoneId);
        if (!milestone) {
            setPendingTargetDatePrompt(null);
            return;
        }

        setTargetDatePromptBusy(true);
        try {
            const updated = await api.milestones.update(milestone.id, { target_date: targetDate });
            setMilestones((prev) => prev.map((m) => (m.id === milestone.id ? updated : m)));
            setPendingTargetDatePrompt(null);
            toast.success("Target date updated successfully.");
        } catch (err) {
            if (err instanceof ApiError) {
                const targetDateError = err.fieldErrors?.target_date;
                toast.error(targetDateError ?? err.message);
            } else {
                toast.error("Couldn't update target date. Please try again later.");
            }
        } finally {
            setTargetDatePromptBusy(false);
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

    function openTargetDatePrompt(milestoneId: number, initialTargetDate: string | null) {
        setPendingTargetDatePrompt({
            milestoneId,
            initialTargetDate,
            allowSkipTargetDate: false,
        });
    }

    function askGoalCoach() {
        const message = `I would like to generate milestones for my goal "${goalTitle}"`;

        if (sourceConversationId !== null) {
            setPendingCoachAction({ autoMessage: message, goal_id: goalId });
        } else {
            navigate(ROUTES.ASSISTANT, { state: { agentType: "goal_coach", autoMessage: message, goal_id: goalId } });
        }
    }

    const sorted = [...milestones].sort((a, b) => a.position - b.position || a.id - b.id);
    const completedCount = milestones.filter((m) => m.status === "Completed").length;
    const hasAny = milestones.length > 0;
    const confirmUpdateTarget = milestones.find((m) => m.id === confirmUpdateId) ?? null;
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
                        <button type="button" className="btn btn-soft btn-sm" onClick={askGoalCoach}>
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

                            return (
                                <div
                                    key={milestone.id}
                                    className={`goal-milestone-item${index > 0 ? " has-separator" : ""}${isExpanded ? " is-expanded" : ""}`}
                                >
                                    <button
                                        type="button"
                                        className={`goal-milestone-check mt-1${completed ? " is-done" : ""}`}
                                        disabled={busy}
                                        onClick={() => void requestStatusChange(milestone, completed ? "Not Started" : "Completed")}
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
                                                                onClick={() => void requestStatusChange(milestone, s)}
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
                                                        <Dropdown.Item onClick={() => toggleMilestoneExpanded(milestone.id)}>
                                                            {isExpanded
                                                                ? <><ArrowsAngleContract size={14} className="me-2" /> Collapse</>
                                                                : <><ArrowsAngleExpand size={14} className="me-2" /> Expand</>
                                                            }
                                                        </Dropdown.Item>
                                                        {!milestone.target_date && (
                                                            <Dropdown.Item onClick={() => openTargetDatePrompt(milestone.id, milestone.target_date)}>
                                                                <CalendarEvent size={14} className="me-2" /> Set Target Date
                                                            </Dropdown.Item>
                                                        )}
                                                        <Dropdown.Divider />
                                                        <Dropdown.Item
                                                            onClick={() => {
                                                                navigate(
                                                                    ROUTES.MY_GOAL_MILESTONE_TASK_CREATE
                                                                        .replace(":goalId", String(goalId))
                                                                        .replace(":milestoneId", String(milestone.id))
                                                                );
                                                            }}
                                                        >
                                                            <ListTask size={14} className="me-2" /> Add Task
                                                        </Dropdown.Item>
                                                        <Dropdown.Item
                                                            onClick={() => {
                                                                const msg = `Create tasks for milestone "${milestone.title}" of my goal "${goalTitle}". Break the milestone into a concrete, actionable task that I can work on.`;
                                                                if (sourceConversationId) {
                                                                    setPendingCoachAction({ autoMessage: msg, goal_id: goalId, milestone_id: milestone.id });
                                                                } else {
                                                                    navigate(ROUTES.ASSISTANT, { state: { agentType: "goal_coach", autoMessage: msg, goal_id: goalId, milestone_id: milestone.id } });
                                                                }
                                                            }}
                                                        >
                                                            <Stars size={14} className="me-2" /> Ask Goal Coach
                                                        </Dropdown.Item>
                                                        <Dropdown.Divider />
                                                        <Dropdown.Item onClick={() => setConfirmUpdateId(milestone.id)}>
                                                            <PencilSquare size={14} className="me-2" /> Update
                                                        </Dropdown.Item>
                                                        <Dropdown.Item
                                                            className="text-danger"
                                                            onClick={() => setConfirmDeleteId(milestone.id)}
                                                        >
                                                            <Trash3 size={14} className="me-2" /> Delete
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
                                                    <button
                                                        type="button"
                                                        className="btn p-0 border-0 bg-transparent shadow-none"
                                                        disabled={busy}
                                                        aria-label="Update target date"
                                                        onClick={() => openTargetDatePrompt(milestone.id, milestone.target_date)}
                                                    >
                                                        <span className="pill pill-warn">
                                                            {formatTargetDate(milestone.target_date)}
                                                        </span>
                                                    </button>
                                                )}
                                            </div>
                                        )}

                                        {busy ? (
                                            <>
                                                {isExpanded && (
                                                    <div className="goal-milestone-inline-loading" aria-live="polite" aria-busy="true">
                                                        <div className="milestone-skeleton milestone-skeleton-description mt-0" />
                                                        <div className="milestone-skeleton milestone-skeleton-description mt-0 goal-milestone-inline-loading-line-short" />
                                                        <div className="goal-milestone-meta mt-0">
                                                            <div className="milestone-skeleton milestone-skeleton-pill-2" />
                                                            <div className="milestone-skeleton milestone-skeleton-pill-2" />
                                                            <div className="milestone-skeleton milestone-skeleton-pill-2" />
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                {milestone.total_tasks > 0 && (
                                                    <MilestoneTasksList goalId={goalId} milestoneId={milestone.id} />
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
                                                        <section className="goal-milestone-outline-item goal-milestone-outline-item-timeline">
                                                            <h4 className="goal-milestone-outline-title">Timeline</h4>
                                                            {(() => {
                                                                const timelineStages = [
                                                                    { key: "created", label: "Created", value: milestone.created_at },
                                                                    milestone.started_at
                                                                        ? { key: "started", label: "Started", value: milestone.started_at }
                                                                        : null,
                                                                    (milestone.paused_at && milestone.status === "Paused")
                                                                        ? { key: "paused", label: "Paused", value: milestone.paused_at }
                                                                        : null,
                                                                    ((milestone.status === "Cancelled" || milestone.status === "Completed") && (milestone.completed_at || milestone.cancelled_at))
                                                                        ? {
                                                                            key: milestone.status === "Cancelled" ? "cancelled" : "completed",
                                                                            label: milestone.status === "Cancelled" ? "Cancelled" : "Completed",
                                                                            value: milestone.status === "Cancelled" ? milestone.cancelled_at : milestone.completed_at,
                                                                        }
                                                                        : null,
                                                                ].filter((item): item is { key: string; label: string; value: string } => item !== null);

                                                                return (
                                                                    <div
                                                                        className={`goal-milestone-outline-timeline${timelineStages.length > 1 ? " has-line" : ""}`}
                                                                        role="list"
                                                                        aria-label="Milestone timeline flow"
                                                                    >
                                                                        {timelineStages.map((item, index) => (
                                                                            <div
                                                                                key={item.key}
                                                                                className={`goal-milestone-timeline-step${index === 0 ? " is-first" : ""}${index > 0 && index === timelineStages.length - 1 ? " is-last" : ""}`}
                                                                                role="listitem"
                                                                            >
                                                                                {timelineStages.length > 1 && <span className="goal-milestone-timeline-node" aria-hidden="true" />}
                                                                                <span className="goal-milestone-timeline-label">{item.label}</span>
                                                                                <span className="goal-milestone-timeline-date">{formatTargetDate(item.value)}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                );
                                                            })()}
                                                        </section>
                                                    </div>
                                                </div>
                                            </>
                                        )}


                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            <ConfirmDialog
                show={confirmUpdateId !== null}
                title="Update this milestone?"
                message={
                    confirmUpdateTarget
                        ? `Updating "${confirmUpdateTarget.title}" can affect progress timelines and coach suggestions. Continue?`
                        : undefined
                }
                confirmLabel="Update"
                onConfirm={() => {
                    if (confirmUpdateId !== null) {
                        navigate(
                            ROUTES.MY_GOAL_MILESTONE_UPDATE
                                .replace(":goalId", String(goalId))
                                .replace(":milestoneId", String(confirmUpdateId))
                        );
                    }
                    setConfirmUpdateId(null);
                }}
                onCancel={() => setConfirmUpdateId(null)}
            />

            <ConfirmDialog
                show={confirmDeleteId !== null}
                title="Delete this milestone?"
                message={
                    confirmDeleteTarget
                        ? `"${confirmDeleteTarget.title}" will be permanently removed. ${confirmDeleteTarget.total_tasks > 0 ? "All associated tasks will also be deleted." : ""} Are you sure?`
                        : undefined
                }
                confirmLabel="Delete"
                destructive
                busy={deleteBusy}
                onConfirm={() => { if (confirmDeleteId !== null) void handleDelete(confirmDeleteId); }}
                onCancel={() => setConfirmDeleteId(null)}
            />

            <TargetDatePromptDialog
                show={pendingTargetDatePrompt !== null}
                initialDate={pendingTargetDatePrompt?.initialTargetDate ?? null}
                busy={targetDatePromptBusy}
                allowSkip={pendingTargetDatePrompt?.allowSkipTargetDate ?? true}
                onConfirm={(targetDate) => { void updatePendingTargetDate(targetDate); }}
                onClear={() => { void updatePendingTargetDate(null); }}
                onSkip={() => setPendingTargetDatePrompt(null)}
                onCancel={() => setPendingTargetDatePrompt(null)}
            />

            <ChoiceDialog
                show={pendingCoachAction !== null}
                title="Open Goal Coach"
                message="You already have a Goal Coach conversation for this goal. Would you like to continue there or start a new chat?"
                icon={<Stars size={26} />}
                iconColor="var(--jv-brand-1)"
                onHide={() => setPendingCoachAction(null)}
                buttons={[
                    {
                        label: "New Chat",
                        variant: "brand",
                        onClick: () => {
                            if (pendingCoachAction) {
                                navigate(ROUTES.ASSISTANT, { state: { agentType: "goal_coach", autoMessage: pendingCoachAction.autoMessage, goal_id: pendingCoachAction.goal_id, milestone_id: pendingCoachAction.milestone_id } });
                            }
                            setPendingCoachAction(null);
                        },
                    },
                    {
                        label: "Existing Chat",
                        variant: "soft",
                        onClick: () => {
                            if (pendingCoachAction && sourceConversationId) {
                                navigate(ROUTES.ASSISTANT, { state: { conversationId: sourceConversationId, autoMessage: pendingCoachAction.autoMessage, goal_id: pendingCoachAction.goal_id, milestone_id: pendingCoachAction.milestone_id } });
                            }
                            setPendingCoachAction(null);
                        },
                    },
                    {
                        label: "Cancel",
                        variant: "outline-secondary",
                        onClick: () => setPendingCoachAction(null),
                    },
                ]}
            />
        </>
    );
}
