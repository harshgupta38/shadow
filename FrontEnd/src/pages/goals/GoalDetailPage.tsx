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

import { api, ApiError, type Goal, type Milestone, type MilestoneStatus } from "@/api";
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

export function GoalDetailPage() {
  const { goalId } = useParams();
  const id = Number(goalId);
  const navigate = useNavigate();
  const toast = useToast();

  const { data: goal, loading, error, setData } = useAsync<Goal>(
    () => api.goals.get(id),
    [id],
  );

  const [showEdit, setShowEdit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [newMilestone, setNewMilestone] = useState("");
  const [addingMilestone, setAddingMilestone] = useState(false);
  const [busyMilestoneId, setBusyMilestoneId] = useState<number | null>(null);

  function applyMilestones(milestones: Milestone[]) {
    setData((prev) =>
      prev ? { ...prev, milestones, progress: milestoneProgress(milestones) ?? prev.progress } : prev,
    );
  }

  async function addMilestone() {
    if (!goal || !newMilestone.trim()) return;
    setAddingMilestone(true);
    try {
      const created = await api.goals.addMilestone(goal.id, {
        title: newMilestone.trim(),
        order: goal.milestones.length,
      });
      applyMilestones([...goal.milestones, created]);
      setNewMilestone("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't add milestone.");
    } finally {
      setAddingMilestone(false);
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
          <Link to="/assistant?agent=goal_coach" className="btn btn-soft btn-sm">
            <Stars size={14} className="me-1" /> Ask Goal Coach
          </Link>
        }
      >
        {/* Add milestone */}
        <div className="d-flex gap-2 mb-3">
          <input
            className="form-control"
            placeholder="Add a milestone…"
            value={newMilestone}
            onChange={(e) => setNewMilestone(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addMilestone();
              }
            }}
          />
          <button
            className="btn btn-brand flex-shrink-0"
            onClick={addMilestone}
            disabled={addingMilestone || !newMilestone.trim()}
          >
            <PlusLg size={16} />
          </button>
        </div>

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
              return (
                <div
                  key={milestone.id}
                  className={`d-flex align-items-center gap-3 py-2 ${
                    index > 0 ? "border-top" : ""
                  }`}
                  style={{ borderColor: "var(--jv-border)" }}
                >
                  <button
                    type="button"
                    className="btn p-0 border-0 flex-shrink-0"
                    disabled={busy}
                    onClick={() => setMilestoneStatus(milestone, done ? "todo" : "done")}
                    aria-label={done ? "Mark as not done" : "Mark as done"}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      display: "grid",
                      placeItems: "center",
                      background: done ? "var(--jv-brand-gradient)" : "transparent",
                      border: done ? "none" : "2px solid var(--jv-border-strong)",
                      color: "#fff",
                    }}
                  >
                    {done && <CheckLg size={14} />}
                  </button>

                  <div className="flex-grow-1 min-w-0">
                    <div className={`fw-medium ${done ? "text-decoration-line-through text-muted-2" : ""}`}>
                      {milestone.title}
                    </div>
                    {milestone.due_date && (
                      <div className="text-faint small">{formatDate(milestone.due_date)}</div>
                    )}
                  </div>

                  <Pill variant={MILESTONE_STATUS_PILL[milestone.status]} className="d-none d-sm-inline-flex">
                    {MILESTONE_STATUS_LABEL[milestone.status]}
                  </Pill>

                  <Dropdown align="end">
                    <Dropdown.Toggle
                      as="button"
                      className="btn btn-ghost btn-icon border-0"
                      style={{ width: 34, height: 34 }}
                      disabled={busy}
                    >
                      <ThreeDotsVertical size={16} />
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
                      <Dropdown.Divider />
                      <Dropdown.Item className="text-danger" onClick={() => removeMilestone(milestone)}>
                        <Trash3 size={14} className="me-2" /> Delete
                      </Dropdown.Item>
                    </Dropdown.Menu>
                  </Dropdown>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <GoalFormModal
        show={showEdit}
        goal={goal}
        onClose={() => setShowEdit(false)}
        onSaved={(updated) => setData(updated)}
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
