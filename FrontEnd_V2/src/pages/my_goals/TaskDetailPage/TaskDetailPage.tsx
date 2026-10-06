import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowLeftRight,
  BoxArrowUpRight,
  ChevronDown,
  ChevronUp,
} from "react-bootstrap-icons";

import { api, ApiError } from "@/api";
import type { HabitActivityRecord, TaskActivityResponse, TaskDataResponse } from "@/api";
import { trackProgressApi } from "@/api/track_progress";
import { useTimeFormat } from "@/context/PlannerContext";
import { useToast } from "@/context/ToastContext";
import { formatTime } from "@/services/date.service";
import { ProgressRing } from "@/components/ui/ProgressRing/ProgressRing";
import { ROUTES } from "@/routes/RoutePaths";
import { PRIORITY_LABEL } from "@/pages/plan/PlanPage.constants";
import { PriorityIcon } from "@/pages/habit_library/HabitCard/HabitCard.constants";
import { HabitHeatmap } from "@/pages/habit_library/HabitDetailPage/HabitHeatmap/HabitHeatmap";
import { HabitHistory } from "@/pages/habit_library/HabitDetailPage/HabitHistory/HabitHistory";
import { getSimpleFrequencyLabel } from "@/pages/habit_library/HabitCard/HabitCard.constants";
import { DetailPageSkeleton } from "@/pages/habit_library/HabitDetailPage/DetailPageSkeleton/DetailPageSkeleton";
import {
  HabitTaskSwitcherPanel,
  type HabitSwitchItem,
  type TaskSwitchItem,
} from "@/pages/habit_library/HabitDetailPage/HabitTaskSwitcherPanel/HabitTaskSwitcherPanel";

import "@/pages/my_goals/GoalDetailPage/GoalDetailPage.scss";
import "@/pages/habit_library/HabitDetailPage/HabitDetailPage.scss";
import "@/pages/plan/PlanCard/PlanCard.scss";
// .hl-card / .hl-card-header / .hl-card-body / .hl-title (used by HabitHeatmap
// and HabitHistory below) are only defined here — see the same import in
// HabitDetailPage.tsx for why this can't be skipped.
import "@/pages/habit_library/HabitLibraryPage.scss";
import "./TaskDetailPage.scss";

// ── Helpers ───────────────────────────────────────────────────────────────────

type TaskStatus = TaskDataResponse["status"];

function statusSlug(status: TaskStatus): string {
  return status.toLowerCase().replace(/\s+/g, "-");
}

function completionPct(task: TaskDataResponse): number {
  if (task.task_type === "Binary") {
    return task.status === "Completed" ? 100 : 0;
  }
  const cur = task.current_value ?? 0;
  const tgt = task.target_value ?? 0;
  if (tgt <= 0) return 0;
  return Math.min(100, Math.round((cur / tgt) * 100));
}

// ── Hero ──────────────────────────────────────────────────────────────────────

function TaskHero({
  task,
  goalTitle,
  goalId,
}: {
  task: TaskDataResponse;
  goalTitle: string | null;
  goalId: number;
}) {
  const navigate = useNavigate();
  const timeFormat = useTimeFormat();
  const [isExpanded, setIsExpanded] = useState(false);

  const pct = completionPct(task);
  const slug = statusSlug(task.status);

  return (
    <div className={`surface goal-detail-hero${isExpanded ? " is-expanded" : ""}`}>
      <div className="d-flex flex-column flex-md-row gap-4 align-items-md-center">

        {/* Left — completion ring */}
        <div className="goal-detail-hero-progress" aria-hidden="true">
          <ProgressRing percentage={pct} />
        </div>

        {/* Right — content */}
        <div className="flex-grow-1 min-w-0">

          {/* Chips row + expand toggle */}
          <div className="d-flex align-items-center gap-2 flex-wrap mb-2 goal-detail-hero-head">

            {/* Status */}
            <span className={`td-status-chip td-status-chip--${slug}`}>
              <span className="td-status-dot" aria-hidden="true" />
              {task.status}
            </span>

            {/* Priority */}
            <span className={`plan-card-pill plan-card-pill--priority-${task.priority}`}>
              <PriorityIcon priority={task.priority} />
              {PRIORITY_LABEL[task.priority]}
            </span>

            {/* Type */}
            <span className="plan-card-pill plan-card-pill--type-task">
              {task.task_type}
            </span>

            {/* Expand/Collapse */}
            <div className="goal-detail-hero-actions ms-auto">
              <button
                type="button"
                className="btn btn-ghost btn-icon goal-detail-action-btn"
                aria-label={isExpanded ? "Collapse details" : "Expand details"}
                aria-expanded={isExpanded}
                onClick={() => setIsExpanded((v) => !v)}
              >
                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>
          </div>

          {/* Title */}
          <h1 className="goal-detail-title h3 fw-bold mb-1">{task.title}</h1>

          {/* Note */}
          {task.note && <p className="goal-detail-copy mt-1">{task.note}</p>}

          {/* Expandable detail rows */}
          <div className={`hd-details-shell${isExpanded ? " is-expanded" : ""}`}>
            <div className="hd-details-inner">
              <div className="hd-detail-rows">

                {task.planning_enabled && task.frequencies.length > 0 && (
                  <div className="hd-detail-row">
                    <span className="hd-detail-label">Frequency</span>
                    <span className="hd-detail-value" style={{ textTransform: "capitalize" }}>
                      {getSimpleFrequencyLabel(task).suffix}
                    </span>
                  </div>
                )}

                {task.planning_enabled && task.preferred_time && task.preferred_time !== "flexible" && (
                  <div className="hd-detail-row">
                    <span className="hd-detail-label">Time</span>
                    <span className="hd-detail-value" style={{ textTransform: "capitalize" }}>
                      {task.preferred_time === "custom" ? (task.specific_time ? formatTime(task.specific_time, timeFormat) : "Custom") : task.preferred_time}
                    </span>
                  </div>
                )}

                {task.duration_minutes != null && task.duration_minutes > 0 && (
                  <div className="hd-detail-row">
                    <span className="hd-detail-label">Duration</span>
                    <span className="hd-detail-value">{task.duration_minutes} min</span>
                  </div>
                )}

                {task.planner_target != null && (
                  <div className="hd-detail-row">
                    <span className="hd-detail-label">Target</span>
                    <span className="hd-detail-value">
                      {task.planner_target}
                      {task.value_unit ? ` ${task.value_unit}` : ""}
                    </span>
                  </div>
                )}

                {goalTitle && (
                  <div className="hd-detail-row">
                    <span className="hd-detail-label">Goal</span>
                    <span
                      className="hd-detail-value td-goal-link"
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(ROUTES.MY_GOAL_DETAIL.replace(":goalId", String(goalId)))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter")
                          navigate(ROUTES.MY_GOAL_DETAIL.replace(":goalId", String(goalId)));
                      }}
                    >
                      {goalTitle}
                      <BoxArrowUpRight size={11} />
                    </span>
                  </div>
                )}

              </div>
            </div>
          </div>

          {/* Mobile progress bar */}
          <div className="goal-detail-progress-bar-wrap mt-2" aria-label={`${pct}% complete`}>
            <div className="goal-detail-progress-bar-track">
              <div className="goal-detail-progress-bar-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="goal-detail-progress-bar-label">{pct}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function TaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<TaskActivityResponse | null>(null);
  const [records, setRecords] = useState<HabitActivityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switcherHabits, setSwitcherHabits] = useState<HabitSwitchItem[]>([]);
  const [switcherTasks, setSwitcherTasks] = useState<TaskSwitchItem[]>([]);
  const toast = useToast();

  function openSwitcher() {
    Promise.all([trackProgressApi.getEligibleHabits(), trackProgressApi.getEligibleTasks()])
      .then(([habitData, taskData]) => {
        setSwitcherHabits(habitData.map((h) => ({
          id: h.id,
          title: h.title,
          type: h.planner_type === "metric" ? "Metric" as const : "Simple" as const,
          priority: h.priority,
          category: h.category,
        })));
        setSwitcherTasks(taskData.map((t) => ({
          id: t.id,
          title: t.title,
          type: t.planner_type === "metric" ? "Metric" as const : "Simple" as const,
          priority: t.priority,
        })));
        setSwitcherOpen(true);
      })
      .catch((err) => {
        toast.error(err instanceof ApiError ? err.message : "Couldn't load habits and tasks.");
      });
  }

  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await api.tasks.getActivity(Number(taskId));
        if (cancelled) return;
        setData(result);
        setRecords(result.records);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof ApiError ? err.message : "Failed to load task details.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [taskId]);

  if (loading) {
    return (
      <div className="hd-page goal-detail-page">
        <DetailPageSkeleton />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="hd-page goal-detail-page">
        <button onClick={() => navigate(-1)} className="goal-detail-back-link">
          <ArrowLeft size={15} /> Back
        </button>
        <div className="hd-status-state hd-status-state--error">
          <p>{error ?? "Task not found."}</p>
          <button onClick={() => navigate(-1)} className="btn btn-sm btn-outline-secondary">
            Back
          </button>
        </div>
      </div>
    );
  }

  const { task, goal_title } = data;

  const plannerConfig = {
    planner_type: task.planner_type,
    planner_target: task.planner_target,
    value_unit: task.value_unit,
    frequencies: task.frequencies,
    specific_days: task.specific_days ?? null,
  } as const;

  return (
    <div className="hd-page goal-detail-page habit-library-page">
      <div className="hd-top-row">
        <button onClick={() => navigate(-1)} className="goal-detail-back-link">
          <ArrowLeft size={15} /> Back
        </button>
        <button onClick={openSwitcher} className="goal-detail-back-link">
          <ArrowLeftRight size={15} /> Switch
        </button>
      </div>

      <TaskHero key={`hero-${task.id}`} task={task} goalTitle={goal_title} goalId={task.goal_id} />
      <HabitHeatmap key={`heatmap-${task.id}`} habit={plannerConfig} records={records} />
      <HabitHistory key={`history-${task.id}`} habit={plannerConfig} records={records} />

      {switcherOpen && (
        <HabitTaskSwitcherPanel
          habits={switcherHabits}
          tasks={switcherTasks}
          activeTaskId={task.id}
          onClose={() => setSwitcherOpen(false)}
          onSelectHabit={(id) => navigate(ROUTES.HABIT_LIBRARY_DETAIL.replace(":habitId", String(id)))}
          onSelectTask={(id) => navigate(ROUTES.TASK_DETAIL.replace(":taskId", String(id)))}
        />
      )}
    </div>
  );
}
