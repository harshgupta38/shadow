import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bullseye,
  CheckLg,
  CheckSquareFill,
  Clock,
  DashLg,
  Floppy,
  Link45deg,
  MoonFill,
  MoonStarsFill,
  PlusLg,
  SunFill,
  TagFill,
} from "react-bootstrap-icons";

import type { PlanDataResponse, PlanPriority } from "@/api";
import { ROUTES } from "@/routes/RoutePaths";
import { PRIORITY_LABEL, formatDuration } from "@/pages/plan/PlanPage.constants";
import "./PlanCard.scss";

interface PlanCardProps {
  item: PlanDataResponse;
  onToggle?: () => void;
  onSaveProgress?: (value: number) => Promise<void>;
  busy?: boolean;
  readOnly?: boolean;
}

function toPercent(current: number, target: number): number {
  if (target <= 0) return 0;
  return Math.max(0, Math.round((current / target) * 100));
}

function TimeChip({ preferredTime, label }: { preferredTime: string; label: string }) {
  const t = preferredTime.toLowerCase();
  let icon: React.ReactNode;
  let mod = "";

  if (t === "morning") {
    icon = <SunFill size={12} />;
    mod = "plan-card-time--morning";
  } else if (t === "afternoon") {
    icon = <SunFill size={12} />;
    mod = "plan-card-time--afternoon";
  } else if (t === "evening") {
    icon = <MoonFill size={11} />;
    mod = "plan-card-time--evening";
  } else if (t === "night") {
    icon = <MoonStarsFill size={11} />;
    mod = "plan-card-time--night";
  } else {
    icon = <Clock size={12} />;
    mod = "plan-card-time--clock";
  }

  return (
    <span className={`plan-card-time${mod ? ` ${mod}` : ""}`}>
      {icon}
      {label}
    </span>
  );
}

function PriorityIcon({ priority }: { priority: PlanPriority }) {
  if (priority === "highest" || priority === "high") return <ArrowUpRight size={11} />;
  if (priority === "low" || priority === "lowest") return <ArrowDownRight size={11} />;
  return <DashLg size={11} />;
}

export function PlanCard({ item, onToggle, onSaveProgress, busy = false, readOnly = false }: PlanCardProps) {
  const navigate = useNavigate();
  const isDone = item.saved_data?.status === "done";
  const isMissed = item.saved_data?.status === "missed";
  const target = item.planner_target ?? 0;
  const isMetric = item.planner_type === "metric" && target > 0;

  const timeLabel =
    item.preferred_time === "custom"
      ? item.specific_time
      : item.preferred_time !== "flexible"
        ? item.preferred_time.charAt(0).toUpperCase() + item.preferred_time.slice(1)
        : null;

  const hasDuration = item.duration_minutes !== null && item.duration_minutes > 0;

  const [progressDraft, setProgressDraft] = useState<number | null>(null);
  const [savingProgress, setSavingProgress] = useState(false);
  const holdTimeoutRef = useRef<number | null>(null);
  const holdIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (holdTimeoutRef.current !== null) window.clearTimeout(holdTimeoutRef.current);
      if (holdIntervalRef.current !== null) window.clearInterval(holdIntervalRef.current);
    };
  }, []);

  const baseCurrent = item.saved_data?.current_value ?? 0;
  const effectiveCurrent = progressDraft !== null ? progressDraft : baseCurrent;
  const pct = isMetric ? toPercent(effectiveCurrent, target) : 0;
  const hasDraft = progressDraft !== null && progressDraft !== baseCurrent;

  function changeProgress(delta: number) {
    if (!isMetric) return;
    setProgressDraft((prev) => {
      const current = prev !== null ? prev : baseCurrent;
      const next = Math.max(0, current + delta);
      if (next === baseCurrent) return null;
      return next === prev ? prev : next;
    });
  }

  function stopProgressHold() {
    if (holdTimeoutRef.current !== null) { window.clearTimeout(holdTimeoutRef.current); holdTimeoutRef.current = null; }
    if (holdIntervalRef.current !== null) { window.clearInterval(holdIntervalRef.current); holdIntervalRef.current = null; }
  }

  function startProgressHold(delta: number) {
    stopProgressHold();
    changeProgress(delta);
    holdTimeoutRef.current = window.setTimeout(() => {
      holdIntervalRef.current = window.setInterval(() => changeProgress(delta), 90);
    }, 260);
  }

  async function handleSaveProgress() {
    if (progressDraft === null || !onSaveProgress) return;
    setSavingProgress(true);
    try {
      await onSaveProgress(progressDraft);
      setProgressDraft(null);
    } finally {
      setSavingProgress(false);
    }
  }

  return (
    <article
      className={`plan-card${isDone ? " plan-card--done" : ""}${isMissed ? " plan-card--missed" : ""}`}
    >
      {/* Row 1 — title · time · checkbox */}
      <div className="plan-card-row">
        <div className="plan-card-left">
          <span className="plan-card-title">{item.title}</span>
          {timeLabel && (
            <TimeChip preferredTime={item.preferred_time} label={timeLabel} />
          )}
        </div>

        {!isMetric && !readOnly && (
          <button
            type="button"
            className={`plan-card-check${isDone ? " is-done" : ""}`}
            disabled={isMissed || busy}
            onClick={onToggle}
            aria-label={isDone ? "Mark as due" : "Mark as done"}
          >
            {isDone && <CheckLg size={12} />}
          </button>
        )}
      </div>

      {/* Row 2 — pills */}
      <div className="plan-card-pills">
        <span className={`plan-card-pill plan-card-pill--type-${item.source_type}`}>
          {item.source_type === "habit" ? <Bullseye size={11} /> : <CheckSquareFill size={11} />}
          {item.source_type === "habit" ? "Habit" : "Task"}
        </span>

        <span className={`plan-card-pill plan-card-pill--priority-${item.priority}`}>
          <PriorityIcon priority={item.priority} />
          {PRIORITY_LABEL[item.priority]}
        </span>

        {item.goal?.category && (
          <span className="plan-card-pill plan-card-pill--category">
            <TagFill size={11} />
            {item.goal.category}
          </span>
        )}

        {item.goal && (
          <button
            type="button"
            className="plan-card-pill plan-card-pill--goal plan-card-pill--clickable"
            title={item.goal.title}
            onClick={() => navigate(ROUTES.MY_GOAL_DETAIL.replace(":goalId", String(item.goal!.id)))}
          >
            <Link45deg size={12} />
            {item.goal.title.length > 15 ? `${item.goal.title.slice(0, 15)}…` : item.goal.title}
          </button>
        )}

        {hasDuration && (
          <span className="plan-card-pill plan-card-pill--duration">
            <Clock size={11} />
            {formatDuration(item.duration_minutes!)}
          </span>
        )}
      </div>

      {/* Row 3 — metric progress */}
      {isMetric && (
        <div className="plan-card-progress" aria-label="Session progress">
          <span className="plan-card-progress-label">
            {effectiveCurrent < target
              ? `${target - effectiveCurrent} ${item.value_unit ?? "items"} left`
              : effectiveCurrent === target
                ? "Target Reached 🥳"
                : "Few extra steps for better future"}
          </span>
          <div className="plan-card-progress-track" aria-hidden="true">
            <div className="plan-card-progress-bar" style={{ width: `${pct}%` }} />
          </div>
          <span className="plan-card-progress-pct">{pct}%</span>
          {!readOnly && (
            <div className="plan-card-progress-actions">
              {hasDraft && onSaveProgress && (
                <button
                  type="button"
                  className="btn btn-ghost btn-icon border-0 plan-card-progress-action plan-card-progress-action-save"
                  aria-label="Save progress"
                  onClick={() => { void handleSaveProgress(); }}
                  disabled={busy || savingProgress}
                >
                  <Floppy size={13} />
                </button>
              )}
              <button
                type="button"
                className="btn btn-ghost btn-icon border-0 plan-card-progress-action"
                aria-label="Decrease"
                onPointerDown={() => startProgressHold(-1)}
                onPointerUp={stopProgressHold}
                onPointerCancel={stopProgressHold}
                onPointerLeave={stopProgressHold}
                disabled={busy || savingProgress || effectiveCurrent <= 0}
              >
                <DashLg size={13} />
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-icon border-0 plan-card-progress-action"
                aria-label="Increase"
                onPointerDown={() => startProgressHold(1)}
                onPointerUp={stopProgressHold}
                onPointerCancel={stopProgressHold}
                onPointerLeave={stopProgressHold}
                disabled={busy || savingProgress}
              >
                <PlusLg size={13} />
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
