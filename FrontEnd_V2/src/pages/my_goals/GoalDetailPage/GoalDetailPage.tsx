import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CalendarCheck, ChevronDown, ChevronUp, PencilSquare, Trash3 } from "react-bootstrap-icons";
import { Link, useNavigate, useParams } from "react-router-dom";

import { api, type GoalDetailResponse } from "@/api";
import { ApiError } from "@/api/client";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { IllustratedErrorState } from "@/components/ui/IllustratedErrorState/IllustratedErrorState";
import { ProgressRing } from "@/components/ui/ProgressRing/ProgressRing";
import { ROUTES } from "@/routes/RoutePaths";
import { useToast } from "@/context/ToastContext";
import { GoalEditWizard } from "@/pages/my_goals/GoalEditWizard/GoalEditWizard";
import { GoalMilestonesSection } from "@/pages/my_goals/GoalMilestonesSection/GoalMilestonesSection";

import "@/pages/my_goals/GoalDetailPage/GoalDetailPage.scss";

type GoalDetailListSection = {
  title: string;
  items: string[];
};

function formatGoalDate(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }

  return new Date(parsed).toLocaleDateString();
}

function formatDueLabel(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return formatGoalDate(value);
  }

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const targetDate = new Date(parsed);
  const targetStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  const diffDays = Math.round((targetStart.getTime() - todayStart.getTime()) / 86400000);

  if (diffDays < 0) {
    return `Overdue by ${Math.abs(diffDays)}d`;
  }

  if (diffDays === 0) {
    return "Due today";
  }

  return `Due in ${diffDays}d`;
}

export function GoalDetailPage() {
  const { goalId } = useParams();
  const navigate = useNavigate();
  const [goal, setGoal] = useState<GoalDetailResponse | null>(null);
  const [loadingGoal, setLoadingGoal] = useState(false);
  const [goalError, setGoalError] = useState<string | null>(null);
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [showEditConfirm, setShowEditConfirm] = useState(false);
  const [showEditWizard, setShowEditWizard] = useState(false);

  const toast = useToast();

  const numericGoalId = Number(goalId);

  const handleDeleteConfirm = async () => {
    setDeleteBusy(true);
    try {
      await api.goals.deleteGoal(numericGoalId);
      navigate(ROUTES.MY_GOALS);
    } catch {
      setDeleteBusy(false);
      setShowDeleteConfirm(false);
      toast.error("Failed to delete goal. Please try again.");
    }
  };

  const loadGoal = useCallback(async () => {
    if (!Number.isInteger(numericGoalId) || numericGoalId <= 0) {
      setGoal(null);
      setGoalError("Goal not found.");
      return;
    }

    setLoadingGoal(true);
    setGoalError(null);

    try {
      const response = await api.goals.getDetail(numericGoalId);
      setGoal(response);
    } catch (error) {
      setGoal(null);
      if (error instanceof ApiError) {
        setGoalError(error.message);
      } else {
        setGoalError("Could not load this goal right now.");
      }
    } finally {
      setLoadingGoal(false);
    }
  }, [numericGoalId]);

  useEffect(() => {
    void loadGoal();
  }, [loadGoal]);

  const detailSections: GoalDetailListSection[] = goal
    ? [
        { title: "Challenges", items: goal.challenges },
        { title: "Strengths", items: goal.strengths },
        { title: "Success Metrics", items: goal.success_metrics },
        { title: "Insights", items: goal.insights },
      ]
    : [];

  return (
    <section className="goal-detail-page">
      <Link to={ROUTES.MY_GOALS} className="goal-detail-back-link">
        <ArrowLeft size={16} /> Back to My Goals
      </Link>

      {loadingGoal ? (
        <div className="surface goal-detail-loading">
          <h2 className="goal-detail-loading-title">Loading your goal...</h2>
          <p className="goal-detail-loading-text">We are bringing the full goal summary into view.</p>
        </div>
      ) : null}

      {!loadingGoal && goalError ? <IllustratedErrorState onRetry={() => void loadGoal()} /> : null}

      {!loadingGoal && !goalError && goal ? (
        <>
          <div className="surface goal-detail-hero">
            <div className="d-flex flex-column flex-md-row gap-4 align-items-md-center">
              <div className="goal-detail-hero-progress" aria-hidden="true">
                <ProgressRing percentage={goal.progress_percent} />
              </div>

              <div className="flex-grow-1 min-w-0">
                <div className="d-flex align-items-center gap-2 flex-wrap mb-2 goal-detail-hero-head">
                  <span className="goal-detail-category">{goal.category}</span>
                  <span className={`goal-detail-status goal-detail-status-${goal.status.toLowerCase()}`}>{goal.status}</span>
                  <span className="goal-detail-due-pill">
                    <CalendarCheck size={12} /> {formatDueLabel(goal.target_date)}
                  </span>

                  <div className="goal-detail-hero-actions ms-auto" aria-label="Goal actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon goal-detail-action-btn"
                      aria-label={isDetailsExpanded ? "Collapse goal details" : "Expand goal details"}
                      aria-expanded={isDetailsExpanded}
                      aria-controls="goal-detail-sections"
                      onClick={() => setIsDetailsExpanded((prev) => !prev)}
                    >
                      {isDetailsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <button type="button" className="btn btn-ghost btn-icon goal-detail-action-btn goal-detail-action-btn-desktop" aria-label="Edit goal" onClick={() => setShowEditConfirm(true)}>
                      <PencilSquare size={16} />
                    </button>
                    <button type="button" className="btn btn-ghost btn-icon text-danger goal-detail-action-btn-delete goal-detail-action-btn-desktop" aria-label="Delete goal" onClick={() => setShowDeleteConfirm(true)}>
                      <Trash3 size={16} />
                    </button>
                  </div>
                </div>

                <h1 className="goal-detail-title h3 fw-bold mb-2">{goal.title}</h1>
                <p className="goal-detail-summary text-muted-2 mb-0">{goal.summary}</p>

                <div className="goal-detail-progress-bar-wrap" aria-label={`${goal.progress_percent}% complete`}>
                  <div className="goal-detail-progress-bar-track">
                    <div className="goal-detail-progress-bar-fill" style={{ width: `${goal.progress_percent}%` }} />
                  </div>
                  <span className="goal-detail-progress-bar-label">{goal.progress_percent}%</span>
                </div>
              </div>
            </div>
          </div>

          <section
            id="goal-detail-sections"
            className={`surface goal-detail-details-shell ${isDetailsExpanded ? "is-expanded mb-3" : "is-collapsed"}`}
            aria-hidden={!isDetailsExpanded}
          >
            <div className="goal-detail-details-shell-inner">
              <div className="goal-detail-mobile-edit-actions" aria-label="Goal actions">
                <button type="button" className="btn btn-ghost btn-icon goal-detail-action-btn" aria-label="Edit goal" onClick={() => setShowEditConfirm(true)}>
                  <PencilSquare size={16} />
                </button>
                <button type="button" className="btn btn-ghost btn-icon text-danger goal-detail-action-btn-delete" aria-label="Delete goal" onClick={() => setShowDeleteConfirm(true)}>
                  <Trash3 size={16} />
                </button>
              </div>
              <div className="goal-detail-outline">
                <section className="goal-detail-outline-item">
                  <h2 className="goal-detail-section-title">Why this goal matters</h2>
                  <p className="goal-detail-copy">{goal.motivation}</p>
                </section>

                <section className="goal-detail-outline-item">
                  <h2 className="goal-detail-section-title">Success definition</h2>
                  <p className="goal-detail-copy">{goal.success_definition}</p>
                </section>

                <section className="goal-detail-outline-item">
                  <h2 className="goal-detail-section-title">Current state</h2>
                  <p className="goal-detail-copy">{goal.current_state}</p>
                </section>

                {detailSections.map((section) => (
                  <section className="goal-detail-outline-item" key={section.title}>
                    <h2 className="goal-detail-section-title">{section.title}</h2>
                    <ul className="goal-detail-list">
                      {section.items.map((item, index) => (
                        <li key={`${section.title}-${index}`}>{item}</li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </div>
          </section>

          <GoalMilestonesSection goalId={goal.id} />
        </>
      ) : null}

      <ConfirmDialog
        show={showEditConfirm}
        title="Edit goal details?"
        message="Changing these details affects how your AI coach understands this goal. Existing milestones and habits won't be updated automatically — any mismatch between the old and new details can cause the agent to generate inconsistent responses. Only edit if it's genuinely necessary."
        confirmLabel="Edit anyway"
        cancelLabel="Keep as is"
        onConfirm={() => { setShowEditConfirm(false); setShowEditWizard(true); }}
        onCancel={() => setShowEditConfirm(false)}
      />

      {goal && showEditWizard ? (
        <GoalEditWizard
          open={showEditWizard}
          goal={goal}
          onClose={() => setShowEditWizard(false)}
          onUpdated={(updated) => { setGoal(updated); setShowEditWizard(false); }}
        />
      ) : null}

      <ConfirmDialog
        show={showDeleteConfirm}
        title="Delete this goal?"
        message="This will permanently remove the goal and all its data. This cannot be undone."
        confirmLabel="Delete"
        destructive
        busy={deleteBusy}
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </section>
  );
}