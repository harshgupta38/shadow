import { useState } from "react";
import { Dropdown } from "react-bootstrap";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarEvent,
  CheckLg,
  PencilSquare,
  PlusLg,
  Stars,
  ThreeDotsVertical,
  Trash3,
} from "react-bootstrap-icons";

import {
  api,
  ApiError,
  type Goal,
  type GoalLinkedRepetitiveTask,
  type Milestone,
  type MilestoneDetail,
  type MilestoneStatus,
} from "@/api";
import { MilestoneEditModal } from "@/components/goals/MilestoneEditModal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { GoalFormModal } from "@/components/goals/GoalFormModal";
import { LoadingState } from "@/components/ui/LoadingState";
import { Pill } from "@/components/ui/Pill";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { SectionCard } from "@/components/ui/SectionCard";
import { useToast } from "@/context/ToastContext";
import { useAsync } from "@/hooks/useAsync";
import { dueLabel, formatDate } from "@/lib/format";
import {
  GOAL_STATUS_LABEL,
  GOAL_STATUS_PILL,
  MILESTONE_STATUS_LABEL,
  MILESTONE_STATUS_PILL,
} from "@/lib/labels";

function milestoneProgress(milestones: Milestone[]): number | null {
  if (milestones.length === 0) return null;
  const done = milestones.filter((m) => m.status === "done").length;
  return Math.round((done * 100) / milestones.length);
}

const STATUS_CYCLE: MilestoneStatus[] = ["todo", "in_progress", "done"];

type PillVariant = "success" | "warn" | "danger" | "info" | "brand" | "muted";

const REPETITIVE_PRIORITY_LABEL: Record<GoalLinkedRepetitiveTask["priority"], string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const REPETITIVE_PRIORITY_PILL: Record<GoalLinkedRepetitiveTask["priority"], PillVariant> = {
  critical: "danger",
  high: "warn",
  medium: "info",
  low: "muted",
};

const REPETITIVE_PRIORITY_SORT: Record<GoalLinkedRepetitiveTask["priority"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

interface MilestoneDetailRow {
  label: string | null;
  value: string;
}

function structuredMilestoneDetails(details: MilestoneDetail[] | null): MilestoneDetailRow[] {
  if (!details || details.length === 0) return [];
  return details
    .map((item) => ({
      label: item.label?.trim() || null,
      value: item.value?.trim() || "",
    }))
    .filter((item) => item.value)
    .slice(0, 8);
}

function parseMilestoneDescription(description: string | null): MilestoneDetailRow[] {
  if (!description) return [];

  const lines = description
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^(?:[-*•●◦▪▫◉○◌‣⁃∙·]|[oO])\s+/i, "").replace(/\*\*/g, "").trim())
    .filter(Boolean)
    .slice(0, 6);

  return lines.map((line) => {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex > 0 && separatorIndex <= 32) {
      const label = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      if (label && value) return { label, value };
    }
    return { label: null, value: line };
  });
}

function hasRichMilestoneDescription(description: string | null): boolean {
  return !!description && /<\/?[a-z][\s\S]*>/i.test(description);
}

export function GoalDetailPage() {
  const { goalId } = useParams();
  const id = Number(goalId);
  const navigate = useNavigate();
  const toast = useToast();

  const { data: goal, loading, error, setData } = useAsync<Goal>(
    () => api.goals.get(id),
    [id],
  );
  const {
    data: linkedRepetitive,
    loading: linkedRepetitiveLoading,
    error: linkedRepetitiveError,
  } = useAsync(() => api.goals.linkedRepetitiveTasks(id), [id]);

  const [showEdit, setShowEdit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addingMilestone, setAddingMilestone] = useState(false);
  const [busyMilestoneId, setBusyMilestoneId] = useState<number | null>(null);
  const [showMilestoneModal, setShowMilestoneModal] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);
  const [savingMilestoneEdit, setSavingMilestoneEdit] = useState(false);

  function applyMilestones(milestones: Milestone[]) {
    setData((prev) =>
      prev ? { ...prev, milestones, progress: milestoneProgress(milestones) ?? prev.progress } : prev,
    );
  }

  async function saveMilestone(payload: {
    title: string;
    description: string | null;
    dueDate: string | null;
  }) {
    if (!goal) return;

    if (!editingMilestone) {
      setAddingMilestone(true);
      try {
        const nextOrder =
          goal.milestones.length > 0
            ? Math.max(...goal.milestones.map((milestone) => milestone.order)) + 1
            : 0;
        const created = await api.goals.addMilestone(goal.id, {
          title: payload.title,
          description: payload.description,
          due_date: payload.dueDate,
          details: null,
          order: nextOrder,
        });
        applyMilestones([...goal.milestones, created]);
        setShowMilestoneModal(false);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Couldn't add milestone.");
      } finally {
        setAddingMilestone(false);
      }
      return;
    }

    setSavingMilestoneEdit(true);
    setBusyMilestoneId(editingMilestone.id);
    try {
      const updated = await api.goals.updateMilestone(editingMilestone.id, {
        title: payload.title,
        description: payload.description,
        due_date: payload.dueDate,
        details: null,
      });
      applyMilestones(goal.milestones.map((m) => (m.id === editingMilestone.id ? updated : m)));
      setEditingMilestone(null);
      setShowMilestoneModal(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update milestone.");
    } finally {
      setSavingMilestoneEdit(false);
      setBusyMilestoneId(null);
    }
  }

  async function setMilestoneStatus(milestone: Milestone, status: MilestoneStatus) {
    if (!goal) return;
    setBusyMilestoneId(milestone.id);
    try {
      const updated = await api.goals.updateMilestone(milestone.id, { status });
      applyMilestones(goal.milestones.map((m) => (m.id === milestone.id ? updated : m)));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update milestone.");
    } finally {
      setBusyMilestoneId(null);
    }
  }

  async function removeMilestone(milestone: Milestone) {
    if (!goal) return;
    setBusyMilestoneId(milestone.id);
    try {
      await api.goals.removeMilestone(milestone.id);
      applyMilestones(goal.milestones.filter((m) => m.id !== milestone.id));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't delete milestone.");
    } finally {
      setBusyMilestoneId(null);
    }
  }

  async function deleteGoal() {
    if (!goal) return;
    setDeleting(true);
    try {
      await api.goals.remove(goal.id);
      toast.success("Goal deleted.");
      navigate("/goals", { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't delete the goal.");
      setDeleting(false);
    }
  }

  if (loading) return <LoadingState label="Loading goal…" />;

  if (error || !goal) {
    return (
      <EmptyState
        icon={<Stars size={26} />}
        title="Goal not found"
        message={error ?? "This goal may have been removed."}
        action={
          <Link to="/goals" className="btn btn-brand">
            Back to goals
          </Link>
        }
      />
    );
  }

  const doneCount = goal.milestones.filter((m) => m.status === "done").length;
  const sortedMilestones = [...goal.milestones].sort(
    (a, b) => a.order - b.order || a.id - b.id,
  );
  const sortedLinkedTasks = [...(linkedRepetitive ?? [])].sort((left, right) => {
    const priorityDiff =
      REPETITIVE_PRIORITY_SORT[left.priority] - REPETITIVE_PRIORITY_SORT[right.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return left.name.localeCompare(right.name);
  });
  const milestoneModalBusy = addingMilestone || savingMilestoneEdit;

  return (
    <div>
      <Link to="/goals" className="btn btn-ghost btn-sm mb-3 text-muted-2">
        <ArrowLeft size={16} className="me-1" /> All goals
      </Link>

      {/* Header */}
      <div className="surface p-4 p-md-4 mb-4">
        <div className="d-flex flex-column flex-md-row gap-4 align-items-md-center">
          <ProgressRing value={goal.progress} size={104} stroke={10} />
          <div className="flex-grow-1 min-w-0">
            <div className="d-flex align-items-center gap-2 flex-wrap mb-2">
              {goal.category && <Pill variant="brand">{goal.category}</Pill>}
              <Pill variant={GOAL_STATUS_PILL[goal.status]} dot>
                {GOAL_STATUS_LABEL[goal.status]}
              </Pill>
              {goal.target_date && (
                <Pill>
                  <CalendarEvent size={12} /> {dueLabel(goal.target_date) ?? formatDate(goal.target_date)}
                </Pill>
              )}
            </div>
            <h1 className="h3 fw-bold mb-2">{goal.title}</h1>
            {goal.description && <p className="text-muted-2 mb-0">{goal.description}</p>}
          </div>
          <div className="d-flex flex-md-column gap-2">
            <button className="btn btn-outline-secondary" onClick={() => setShowEdit(true)}>
              <PencilSquare size={15} className="me-1" /> Edit
            </button>
            <button className="btn btn-ghost text-danger" onClick={() => setConfirmDelete(true)}>
              <Trash3 size={15} className="me-1" /> Delete
            </button>
          </div>
        </div>
      </div>

      {/* Milestones */}
      <SectionCard
        title="Milestones"
        subtitle={
          goal.milestones.length > 0
            ? `${doneCount} of ${goal.milestones.length} complete`
            : "Break this goal into concrete steps"
        }
        actions={
          <div className="d-flex align-items-center gap-2 flex-wrap justify-content-end">
            <Link
              to={`/assistant?agent=goal_coach&goalId=${goal.id}`}
              className="btn btn-soft btn-sm"
            >
              <Stars size={14} className="me-1" /> Ask Goal Coach
            </Link>
            <button
              className="btn btn-brand btn-sm d-flex align-items-center"
              onClick={() => {
                setEditingMilestone(null);
                setShowMilestoneModal(true);
              }}
              disabled={milestoneModalBusy}
            >
              <PlusLg size={15} className="me-1" /> Add milestone
            </button>
          </div>
        }
      >
        {sortedMilestones.length === 0 ? (
          <EmptyState
            compact
            icon={<CheckLg size={22} />}
            title="No milestones yet"
            message="Add a few concrete steps, or ask the Goal Coach to suggest some."
          />
        ) : (
          <div className="d-flex flex-column">
            {sortedMilestones.map((milestone, index) => {
              const done = milestone.status === "done";
              const busy = busyMilestoneId === milestone.id;
              const richDescription = hasRichMilestoneDescription(milestone.description);
              const structuredRows = structuredMilestoneDetails(milestone.details);
              const detailRows =
                !richDescription && structuredRows.length > 0
                  ? structuredRows
                  : parseMilestoneDescription(milestone.description);
              return (
                <div
                  key={milestone.id}
                  className={`d-flex align-items-start gap-3 py-2 ${
                    index > 0 ? "border-top" : ""
                  }`}
                  style={{ borderColor: "var(--jv-border)" }}
                >
                  <button
                    type="button"
                    className={`milestone-check flex-shrink-0 ${done ? "is-done" : ""}`}
                    disabled={busy}
                    onClick={() => setMilestoneStatus(milestone, done ? "todo" : "done")}
                    aria-label={done ? "Mark as not done" : "Mark as done"}
                  >
                    {done && <CheckLg size={14} />}
                  </button>

                  <div className="flex-grow-1 min-w-0">
                    <div className="d-flex align-items-center gap-2">
                      <div className={`fw-medium flex-grow-1 min-w-0 ${done ? "text-muted-2" : ""}`}>
                        {milestone.title}
                      </div>

                      <div className="d-flex align-items-center gap-1 flex-shrink-0">
                        <Dropdown align="end" className="flex-shrink-0">
                          <Dropdown.Toggle
                            as="button"
                            className="btn p-0 border-0 bg-transparent shadow-none milestone-status-toggle"
                            disabled={busy}
                          >
                            <Pill
                              variant={MILESTONE_STATUS_PILL[milestone.status]}
                              className="milestone-status-pill"
                            >
                              {MILESTONE_STATUS_LABEL[milestone.status]}
                            </Pill>
                          </Dropdown.Toggle>
                          <Dropdown.Menu>
                            {STATUS_CYCLE.map((s) => (
                              <Dropdown.Item
                                key={s}
                                active={milestone.status === s}
                                onClick={() => setMilestoneStatus(milestone, s)}
                              >
                                {MILESTONE_STATUS_LABEL[s]}
                              </Dropdown.Item>
                            ))}
                          </Dropdown.Menu>
                        </Dropdown>

                        <Dropdown align="end" className="flex-shrink-0">
                          <Dropdown.Toggle
                            as="button"
                            className="btn btn-ghost btn-icon border-0"
                            style={{ width: 34, height: 34 }}
                            disabled={busy}
                          >
                            <ThreeDotsVertical size={16} />
                          </Dropdown.Toggle>
                          <Dropdown.Menu>
                            <Dropdown.Item
                              onClick={() => {
                                setEditingMilestone(milestone);
                                setShowMilestoneModal(true);
                              }}
                            >
                              <PencilSquare size={14} className="me-2" /> Edit
                            </Dropdown.Item>
                            <Dropdown.Divider />
                            <Dropdown.Item
                              className="text-danger"
                              onClick={() => removeMilestone(milestone)}
                            >
                              <Trash3 size={14} className="me-2" /> Delete
                            </Dropdown.Item>
                          </Dropdown.Menu>
                        </Dropdown>
                      </div>
                    </div>
                    {richDescription && (
                      <div
                        className="milestone-richtext text-muted-2"
                        dangerouslySetInnerHTML={{ __html: milestone.description ?? "" }}
                      />
                    )}
                    {!richDescription && detailRows.length > 0 && (
                      <div className="small text-muted-2 mt-1 d-flex flex-column gap-1">
                        {detailRows.map((row, rowIndex) => (
                          <div key={`${milestone.id}-detail-${rowIndex}`} className="d-flex gap-2">
                            <span className="text-faint">•</span>
                            <span>
                              {row.label ? (
                                <>
                                  <span className="fw-semibold text-body">{row.label}:</span> {row.value}
                                </>
                              ) : (
                                row.value
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {milestone.due_date && (
                      <div className="text-faint small">{formatDate(milestone.due_date)}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <div className="mt-4">
        <SectionCard
          title="Linked repetitive items"
          subtitle="Habits connected to this goal and their current momentum."
        >
          {linkedRepetitiveLoading ? (
            <LoadingState full={false} label="Loading linked repetitive items..." />
          ) : linkedRepetitiveError ? (
            <EmptyState
              compact
              icon={<Stars size={20} />}
              title="Couldn't load linked repetitive items"
              message={linkedRepetitiveError}
            />
          ) : sortedLinkedTasks.length === 0 ? (
            <EmptyState
              compact
              icon={<CheckLg size={20} />}
              title="No linked repetitive items"
              message="Link repetitive habits to this goal to track streak momentum here."
            />
          ) : (
            <div className="d-flex flex-column gap-2">
              {sortedLinkedTasks.map((task) => (
                <article key={task.id} className="surface-2 p-3">
                  <div className="d-flex align-items-start justify-content-between gap-2">
                    <div className="min-w-0">
                      <div className="fw-semibold text-truncate">{task.name}</div>
                      {task.description && <div className="small text-muted-2">{task.description}</div>}
                    </div>
                    <Pill variant={REPETITIVE_PRIORITY_PILL[task.priority]}>
                      {REPETITIVE_PRIORITY_LABEL[task.priority]}
                    </Pill>
                  </div>
                  <div className="d-flex flex-wrap gap-2 mt-2">
                    <Pill variant="brand">{task.category || "Uncategorized"}</Pill>
                    <Pill>
                      Current streak: <span className="fw-semibold">{task.current_streak_days}d</span>
                    </Pill>
                    <Pill>
                      Max streak: <span className="fw-semibold">{task.max_streak_days}d</span>
                    </Pill>
                  </div>
                </article>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <GoalFormModal
        show={showEdit}
        goal={goal}
        onClose={() => setShowEdit(false)}
        onSaved={(updated) => setData(updated)}
      />

      <MilestoneEditModal
        show={showMilestoneModal}
        milestone={editingMilestone}
        busy={milestoneModalBusy}
        onClose={() => {
          if (milestoneModalBusy) return;
          setShowMilestoneModal(false);
          setEditingMilestone(null);
        }}
        onSave={saveMilestone}
      />

      <ConfirmDialog
        show={confirmDelete}
        title="Delete this goal?"
        message="This removes the goal and all its milestones. This can't be undone."
        confirmLabel="Delete goal"
        destructive
        busy={deleting}
        onConfirm={deleteGoal}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
