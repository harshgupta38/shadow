import { useEffect, useState } from "react";
import { CheckLg, ExclamationTriangleFill, Trash3 } from "react-bootstrap-icons";

import type { PlannedTask } from "@/api";
import { Pill } from "@/components/ui/Pill";
import { dueLabel } from "@/lib/format";

type PillVariant = "success" | "warn" | "danger" | "info" | "brand" | "muted";

interface TaskExecutionHint {
  order?: number;
  suggested_start_time?: string | null;
  suggested_finish_by_time?: string | null;
}

interface TaskItemProps {
  task: PlannedTask;
  goalTitle?: string | null;
  onToggle: (task: PlannedTask) => void;
  onLogProgress?: (task: PlannedTask, value: number, metricId?: number) => Promise<void> | void;
  onDelete?: (task: PlannedTask) => void;
  busy?: boolean;
  showPriority?: boolean;
  executionHint?: TaskExecutionHint | null;
}

const PRIORITY_LABEL: Record<PlannedTask["priority"], string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const PRIORITY_PILL: Record<PlannedTask["priority"], PillVariant> = {
  critical: "danger",
  high: "warn",
  medium: "info",
  low: "muted",
};

const IMPACT_FALLBACK_BY_PRIORITY: Record<PlannedTask["priority"], string> = {
  critical: "Skipping this can block critical work and force urgent recovery later today.",
  high: "Skipping this can reduce momentum and compress your schedule window.",
  medium: "Skipping this can weaken consistency and delay planned follow-through.",
  low: "Skipping this can quietly build backlog and make tomorrow harder to start.",
};

export function TaskItem({
  task,
  goalTitle,
  onToggle,
  onLogProgress,
  onDelete,
  busy,
  showPriority,
  executionHint,
}: TaskItemProps) {
  const [progressDraft, setProgressDraft] = useState("");

  function formatAmount(value: number): string {
    if (!Number.isFinite(value)) return "0";
    const rounded = Math.round(value * 100) / 100;
    if (Math.abs(rounded - Math.round(rounded)) < 1e-9) {
      return String(Math.round(rounded));
    }
    return String(rounded);
  }

  const categoryFromTask =
    typeof task.category === "string" && task.category.trim().length > 0
      ? task.category
      : null;
  const impactFromTask =
    typeof task.ai_impact_if_skipped === "string"
    && task.ai_impact_if_skipped.trim().length > 0
      ? task.ai_impact_if_skipped
      : null;
  const goalFromTask =
    typeof task.goal_title === "string" && task.goal_title.trim().length > 0
      ? task.goal_title
      : null;

  const done = task.status === "done";
  const missed = task.status === "missed" || task.missed_yesterday === true;
  const due = dueLabel(task.date);
  const order = executionHint?.order;
  const numberedTitle = order ? `${order}. ${task.title}` : task.title;
  const categoryLabel =
    categoryFromTask
    ?? (task.source === "manual" ? "Routine" : null);
  const impactIfSkipped =
    impactFromTask
    ?? IMPACT_FALLBACK_BY_PRIORITY[task.priority];
  const linkedGoal =
    goalTitle
    ?? goalFromTask
    ?? "Not linked to a goal";
  const urgencyLabel = task.overdue ? "Overdue" : due;
  const primaryLinkedMetric = task.linked_metrics?.[0] ?? null;
  const isQuantifiableTask = primaryLinkedMetric !== null;
  const metricUnitText = primaryLinkedMetric?.unit_text?.trim() || "units";
  const metricLoggedTotal = primaryLinkedMetric ? Number(primaryLinkedMetric.logged_total || 0) : 0;
  const metricTarget = primaryLinkedMetric?.target ?? null;
  const metricRemainingValue =
    metricTarget != null
      ? Math.max(metricTarget - metricLoggedTotal, 0)
      : null;
  const metricProgressLabel =
    primaryLinkedMetric == null
      ? null
      : metricRemainingValue != null
        ? `${formatAmount(metricRemainingValue)} ${metricUnitText}`
        : `${metricLoggedTotal} ${metricUnitText}`;

  useEffect(() => {
    if (!primaryLinkedMetric) {
      setProgressDraft("");
      return;
    }
    setProgressDraft(formatAmount(metricLoggedTotal));
  }, [primaryLinkedMetric, metricLoggedTotal]);

  const scheduleLabel =
    executionHint?.suggested_start_time && executionHint?.suggested_finish_by_time
      ? `${executionHint.suggested_start_time}-${executionHint.suggested_finish_by_time}`
      : executionHint?.suggested_start_time
        ? `Starts ${executionHint.suggested_start_time}`
        : task.suggested_start_time && task.suggested_finish_by_time
          ? `${task.suggested_start_time}-${task.suggested_finish_by_time}`
          : task.suggested_start_time
            ? `Starts ${task.suggested_start_time}`
        : null;

  const bottomRightMeta =
    !done && (urgencyLabel || scheduleLabel)
      ? [scheduleLabel, urgencyLabel].filter(Boolean).join(" · ")
      : null;

  async function submitProgress() {
    if (!primaryLinkedMetric || !onLogProgress) return;
    const numeric = Number(progressDraft);
    if (!Number.isFinite(numeric) || numeric < 0) return;
    await onLogProgress(task, numeric, primaryLinkedMetric.metric_id);
  }

  const parsedProgress = Number(progressDraft);
  const hasProgressInput = progressDraft.trim().length > 0;
  const hasValidProgressInput = Number.isFinite(parsedProgress) && parsedProgress >= 0;
  const isProgressUnchanged = hasValidProgressInput
    ? Math.abs(parsedProgress - metricLoggedTotal) < 1e-9
    : false;

  return (
    <div className="surface-2 p-3 p-sm-4 mb-2">
      <div className="d-flex align-items-start gap-3">
        {!isQuantifiableTask && (
          <button
            type="button"
            className="btn p-0 flex-shrink-0"
            onClick={() => onToggle(task)}
            disabled={busy}
            aria-label={done ? "Mark as not done" : "Mark as done"}
            title={done ? "Mark as not done" : "Mark as done"}
            style={{
              width: 24,
              height: 24,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              background: done ? "var(--jv-brand-gradient)" : "transparent",
              border: done ? "none" : "2px solid var(--jv-brand-1)",
              color: "#fff",
              transition: "all 160ms ease",
            }}
          >
            {done && <CheckLg size={14} />}
          </button>
        )}

      <div className="flex-grow-1 min-w-0">
        <div className="d-flex align-items-start justify-content-between gap-2">
          <div className="d-flex align-items-center gap-2 min-w-0">
            <div className={`fw-semibold text-truncate ${done ? "text-muted-2" : ""}`}>
              {numberedTitle}
            </div>
            {task.missed_yesterday && !done && (
              <span
                className="d-inline-flex align-items-center justify-content-center flex-shrink-0"
                title="Missed yesterday - protect your streak today."
                aria-label="Missed yesterday - protect your streak today."
              >
                <ExclamationTriangleFill size={13} style={{ color: "var(--bs-warning)" }} />
              </span>
            )}
          </div>

          {onDelete && (
            <button
              type="button"
              className="btn btn-ghost btn-icon flex-shrink-0"
              style={{ width: 34, height: 34, color: "var(--jv-danger)" }}
              onClick={() => onDelete(task)}
              disabled={busy}
              aria-label="Delete task"
              title="Delete task"
            >
              <Trash3 size={15} />
            </button>
          )}
        </div>

        {task.ai_rationale && (
          <div className="small text-muted-2 mt-1">
            <span className="fw-semibold">Why today:</span> {task.ai_rationale}
          </div>
        )}

        <div className="small text-muted-2 mt-1">
          <span className="fw-semibold">Impact if skipped:</span> {impactIfSkipped}
        </div>

        {primaryLinkedMetric ? (
          <div className="mt-1 d-flex flex-column flex-xl-row align-items-xl-start justify-content-between gap-2">
            <div className="min-w-0">
              <div className="small text-muted-2">
                <span className="fw-semibold">Goal linked:</span> {linkedGoal}
              </div>
              <div className="small text-muted-2 mt-1">
                <span className="fw-semibold">Remaining:</span> {metricProgressLabel}
              </div>
            </div>

            {!done && onLogProgress && (
              <div className="d-flex align-items-center gap-2 flex-wrap mt-2 mt-xl-0 flex-shrink-0">
                <input
                  type="number"
                  min={0}
                  step="any"
                  className="form-control form-control-sm"
                  style={{ width: 120 }}
                  placeholder={metricUnitText}
                  value={progressDraft}
                  onChange={(event) => setProgressDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void submitProgress();
                    }
                  }}
                  disabled={busy}
                  aria-label="Progress amount"
                />
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => {
                    void submitProgress();
                  }}
                  disabled={busy || !hasProgressInput || !hasValidProgressInput || isProgressUnchanged}
                >
                  Save
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="small text-muted-2 mt-1">
            <span className="fw-semibold">Goal linked:</span> {linkedGoal}
          </div>
        )}

        {task.previous_completion_history && (
          <div className="small text-muted-2 mt-1">
            <span className="fw-semibold">History:</span> {task.previous_completion_history}
          </div>
        )}

        {task.completed_late && (
          <div className="small text-danger mt-1">Completed later than planned.</div>
        )}

        {!done && (showPriority || categoryLabel || bottomRightMeta) && (
          <div className="d-flex align-items-center justify-content-between gap-2 mt-2 flex-wrap">
            <div className="d-flex align-items-center gap-2">
              {showPriority && (
                <Pill variant={PRIORITY_PILL[task.priority]}>
                  {PRIORITY_LABEL[task.priority]}
                </Pill>
              )}
              {categoryLabel && <Pill variant="brand">{categoryLabel}</Pill>}
            </div>

            {bottomRightMeta && (
              <span className={`small text-nowrap ${missed ? "text-danger" : "text-faint"}`}>
                {bottomRightMeta}
              </span>
            )}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
