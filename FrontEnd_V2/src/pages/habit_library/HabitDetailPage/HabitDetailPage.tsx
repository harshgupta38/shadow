import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Clock,
  Link45deg,
  MoonFill,
  MoonStarsFill,
  PencilSquare,
  SunFill,
  Trash3,
} from "react-bootstrap-icons";

import { api, ApiError } from "@/api";
import type { HabitActivityRecord, HabitDataResponse } from "@/api";
import { ProgressRing } from "@/components/ui/ProgressRing/ProgressRing";
import { ROUTES } from "@/routes/RoutePaths";
import { PRIORITY_LABEL } from "@/pages/plan/PlanPage.constants";
import {
  formatStatusLabel,
  getSimpleFrequencyLabel,
  PriorityIcon,
} from "@/pages/habit_library/HabitCard/HabitCard.constants";
import { HabitHeatmap } from "./HabitHeatmap/HabitHeatmap";
import { HabitHistory } from "./HabitHistory/HabitHistory";

import "@/pages/my_goals/GoalDetailPage/GoalDetailPage.scss";
import "./HabitDetailPage.scss";

function formatLongDate(value: string): string {
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleDateString("en-GB", { month: "long" });
  return `${day} ${month} ${d.getFullYear()}`;
}

// ── Inline time label — mirrors ScheduleTaskDetailPanel's TimeChip ────────────

function TimeLabel({ habit }: { habit: HabitDataResponse }) {
  const t = habit.preferred_time;
  if (!t || t === "flexible") return null;

  const label =
    t === "custom"
      ? (habit.specific_time ?? "Custom")
      : t.charAt(0).toUpperCase() + t.slice(1);

  let icon: React.ReactNode;
  let mod: string;
  if (t === "morning") { icon = <SunFill size={12} />; mod = "hd-time--morning"; }
  else if (t === "afternoon") { icon = <SunFill size={12} />; mod = "hd-time--afternoon"; }
  else if (t === "evening") { icon = <MoonFill size={11} />; mod = "hd-time--evening"; }
  else if (t === "night") { icon = <MoonStarsFill size={11} />; mod = "hd-time--night"; }
  else { icon = <Clock size={12} />; mod = "hd-time--clock"; }

  return (
    <span className={`hd-time ${mod}`}>
      {icon}
      {label}
    </span>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────

function HabitHero({
  habit,
  completionPct,
  onDelete,
  deleting,
}: {
  habit: HabitDataResponse;
  completionPct: number;
  onDelete: () => void;
  deleting: boolean;
}) {
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState(false);

  const freqLabel = getSimpleFrequencyLabel(habit);

  const dateRangeLabel = (() => {
    if (!habit.start_date && !habit.end_date) return null;
    const from = habit.start_date ? formatLongDate(habit.start_date) : "—";
    const to = habit.end_date ? formatLongDate(habit.end_date) : "ongoing";
    return `${from} → ${to}`;
  })();

  return (
    <div className={`surface goal-detail-hero${isExpanded ? " is-expanded" : ""}`}>
      <div className="d-flex flex-column flex-md-row gap-4 align-items-md-center">

        {/* Left — completion ring */}
        <div className="goal-detail-hero-progress" aria-hidden="true">
          <ProgressRing percentage={completionPct} />
        </div>

        {/* Right — content */}
        <div className="flex-grow-1 min-w-0">

          {/* Chips row + actions */}
          <div className="d-flex align-items-center gap-2 flex-wrap mb-2 goal-detail-hero-head">
            {/* Category */}
            {habit.category && (
              <span className="goal-detail-category">{habit.category}</span>
            )}

            {/* Status */}
            <span className={`hl-habit-chip hl-habit-chip--status-${habit.status}`}>
              <span className="hl-habit-chip-dot" aria-hidden="true" />
              {formatStatusLabel(habit.status)}
            </span>

            {/* Priority */}
            <span className={`plan-card-pill plan-card-pill--priority-${habit.priority}`}>
              <PriorityIcon priority={habit.priority} />
              {PRIORITY_LABEL[habit.priority]}
            </span>

            {/* Current streak */}
            {habit.current_streak > 0 && (
              <span className="plan-card-streak" aria-label={`${habit.current_streak} day streak`}>
                🔥 {habit.current_streak}
              </span>
            )}

            {/* Max streak */}
            {habit.max_streak > 0 && (
              <span className="plan-card-streak" aria-label={`${habit.max_streak} day best streak`}>
                🏆 {habit.max_streak}
              </span>
            )}

            {/* Linked goal */}
            {habit.goal && (
              <span
                className="goal-detail-link-pill"
                role="button"
                tabIndex={0}
                onClick={() =>
                  navigate(ROUTES.MY_GOAL_DETAIL.replace(":goalId", String(habit.goal!.id)))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter")
                    navigate(ROUTES.MY_GOAL_DETAIL.replace(":goalId", String(habit.goal!.id)));
                }}
              >
                <Link45deg size={12} />
                {habit.goal.title}
              </span>
            )}

            {/* Actions */}
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
              <button
                type="button"
                className="btn btn-ghost btn-icon goal-detail-action-btn goal-detail-action-btn-desktop"
                aria-label="Edit habit"
                onClick={() =>
                  navigate(
                    ROUTES.HABIT_LIBRARY_EDIT.replace(":habitId", String(habit.id)),
                    { state: { habit } },
                  )
                }
              >
                <PencilSquare size={16} />
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-icon goal-detail-action-btn goal-detail-action-btn-desktop hd-delete-btn"
                aria-label="Delete habit"
                onClick={onDelete}
                disabled={deleting}
              >
                <Trash3 size={16} />
              </button>
            </div>
          </div>

          {/* Title */}
          <h1 className="goal-detail-title h3 fw-bold mb-1">{habit.title}</h1>

          {/* Note */}
          {habit.note && <p className="goal-detail-copy mt-1">{habit.note}</p>}

          {/* Expandable detail rows — slides open on chevron toggle */}
          <div className={`hd-details-shell${isExpanded ? " is-expanded" : ""}`}>
            <div className="hd-details-inner">
              <div className="hd-detail-rows">

                <div className="hd-detail-row">
                  <span className="hd-detail-label">Frequency</span>
                  <span className="hd-detail-value" style={{ textTransform: "capitalize" }}>{freqLabel.suffix}</span>
                </div>

                {habit.preferred_time && habit.preferred_time !== "flexible" && (
                  <div className="hd-detail-row">
                    <span className="hd-detail-label">Time</span>
                    <span className="hd-detail-value">
                      <TimeLabel habit={habit} />
                    </span>
                  </div>
                )}

                {habit.duration_minutes != null && habit.duration_minutes > 0 && (
                  <div className="hd-detail-row">
                    <span className="hd-detail-label">Duration</span>
                    <span className="hd-detail-value">{habit.duration_minutes} min</span>
                  </div>
                )}

                {habit.planner_type === "metric" && habit.planner_target != null && (
                  <div className="hd-detail-row">
                    <span className="hd-detail-label">Target</span>
                    <span className="hd-detail-value">
                      {habit.planner_target}
                      {habit.value_unit ? ` ${habit.value_unit}` : ""}
                    </span>
                  </div>
                )}

                {dateRangeLabel && (
                  <div className="hd-detail-row">
                    <span className="hd-detail-label">Date</span>
                    <span className="hd-detail-value">{dateRangeLabel}</span>
                  </div>
                )}

              </div>
            </div>
          </div>

          {/* Mobile progress bar */}
          <div
            className="goal-detail-progress-bar-wrap mt-2"
            aria-label={`${completionPct}% completion rate`}
          >
            <div className="goal-detail-progress-bar-track">
              <div
                className="goal-detail-progress-bar-fill"
                style={{ width: `${completionPct}%` }}
              />
            </div>
            <span className="goal-detail-progress-bar-label">{completionPct}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function HabitDetailPage() {
  const { habitId } = useParams<{ habitId: string }>();

  const [habit, setHabit] = useState<HabitDataResponse | null>(null);
  const [records, setRecords] = useState<HabitActivityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();

  useEffect(() => {
    if (!habitId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await api.habits.getActivity(Number(habitId));
        if (cancelled) return;
        setHabit(data.habit);
        setRecords(data.records);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof ApiError ? err.message : "Failed to load habit details.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [habitId]);

  const currentMonthPct = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const monthRecs = records.filter((r) => {
      if (r.status === "due") return false;
      const d = new Date(`${r.date}T00:00:00`);
      return d.getFullYear() === y && d.getMonth() === m;
    });
    const done = monthRecs.filter((r) => r.status === "done").length;
    return monthRecs.length > 0 ? Math.round((done / monthRecs.length) * 100) : 0;
  }, [records]);

  async function handleDelete() {
    if (!habit || deleting) return;
    if (!window.confirm(`Delete "${habit.title}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await api.habits.removeHabit(habit.id);
      navigate(ROUTES.HABIT_LIBRARY, { replace: true });
    } catch {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="hd-page goal-detail-page">
        <div className="hd-status-state">
          <div className="spinner-border spinner-border-sm text-secondary" role="status" />
          <span>Loading…</span>
        </div>
      </div>
    );
  }

  if (error || !habit) {
    return (
      <div className="hd-page goal-detail-page">
        <button onClick={() => navigate(-1)} className="goal-detail-back-link">
          <ArrowLeft size={15} /> Library
        </button>
        <div className="hd-status-state hd-status-state--error">
          <p>{error ?? "Habit not found."}</p>
          <button onClick={() => navigate(-1)} className="btn btn-sm btn-outline-secondary">
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="hd-page goal-detail-page habit-library-page">
      <button onClick={() => navigate(-1)} className="goal-detail-back-link">
        <ArrowLeft size={15} /> Back
      </button>

      <HabitHero habit={habit} completionPct={currentMonthPct} onDelete={handleDelete} deleting={deleting} />

      <HabitHeatmap habit={habit} records={records} />

      <HabitHistory habit={habit} records={records} />

    </div>
  );
}
