import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bullseye,
  CalendarEvent,
  ChatSquareDots,
  CheckLg,
  CheckSquareFill,
  Clock,
  DashLg,
  Floppy,
  Link45deg,
  MoonFill,
  MoonStarsFill,
  PencilFill,
  PlusLg,
  SunFill,
  TagFill,
} from "react-bootstrap-icons";

import { NoteDialog } from "@/components/ui/NoteDialog/NoteDialog";

import type { PlanDataResponse, PlanPriority } from "@/api";
import { ROUTES } from "@/routes/RoutePaths";
import { PRIORITY_LABEL, formatDuration } from "@/pages/plan/PlanPage.constants";
import "./PlanCard.scss";

interface PlanCardProps {
  item: PlanDataResponse;
  onToggle?: () => void;
  onSaveProgress?: (value: number) => Promise<void>;
  onSaveNote?: (note: string) => Promise<void>;
  onSaveNoteAndDone?: (note: string) => Promise<void>;
  busy?: boolean;
  readOnly?: boolean;
  isCompleting?: boolean;
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

export function PlanCard({ item, onToggle, onSaveProgress, onSaveNote, onSaveNoteAndDone, busy = false, readOnly = false, isCompleting = false }: PlanCardProps) {
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
  const [inputDelta, setInputDelta] = useState("");
  const holdTimeoutRef = useRef<number | null>(null);
  const holdIntervalRef = useRef<number | null>(null);

  const existingNote = item.saved_data?.note ?? "";
  const [noteOpen, setNoteOpen] = useState(false);
  const [savingNote, setSavingNote] = useState(false);

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

  async function handleSaveNote(note: string) {
    if (!onSaveNote) return;
    setSavingNote(true);
    try {
      await onSaveNote(note);
      setNoteOpen(false);
    } finally {
      setSavingNote(false);
    }
  }

  async function handleSaveNoteAndDone(note: string) {
    if (!onSaveNoteAndDone) return;
    setSavingNote(true);
    try {
      await onSaveNoteAndDone(note);
      setNoteOpen(false);
    } finally {
      setSavingNote(false);
    }
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

  async function handleSaveProgressDelta() {
    const delta = parseInt(inputDelta, 10);
    if (isNaN(delta) || delta === 0 || !onSaveProgress) return;
    setSavingProgress(true);
    try {
      await onSaveProgress(Math.max(0, baseCurrent + delta));
      setInputDelta("");
    } finally {
      setSavingProgress(false);
    }
  }

  return (
    <article
      className={`plan-card${isDone ? " plan-card--done" : ""}${isMissed ? " plan-card--missed" : ""}${isCompleting ? " plan-card--completing" : ""}`}
    >
      {/* Row 1 — title · time · checkbox */}
      <div className="plan-card-row">
        <div className="plan-card-left">
          {(item.saved_data?.current_streak ?? 0) >= 1 && (
            <span className="plan-card-streak" aria-label={`${item.saved_data!.current_streak} day streak`}>
              🔥 {item.saved_data!.current_streak}
            </span>
          )}
          <span className="plan-card-title">{item.title}</span>
          {timeLabel && (
            <TimeChip preferredTime={item.preferred_time} label={timeLabel} />
          )}
        </div>

        {!isMetric && !readOnly && (
          busy ? (
            <span className="plan-card-check-spinner" role="status" aria-label="Updating status">
              <span className="spinner-border spinner-border-sm" aria-hidden="true" />
            </span>
          ) : (
            <button
              type="button"
              className={`plan-card-check${isDone ? " is-done" : ""}`}
              disabled={isMissed}
              onClick={onToggle}
              aria-label={isDone ? "Mark as due" : "Mark as done"}
            >
              {isDone && <CheckLg size={12} />}
            </button>
          )
        )}
      </div>

      {/* Row 2 — saved note */}
      {existingNote && (
        <p className="plan-card-note">
          <span className="plan-card-note-text">{existingNote}</span>
          {!readOnly && (
            <button
              type="button"
              className="plan-card-note-edit"
              onClick={() => setNoteOpen(true)}
              aria-label="Edit note"
            >
              <PencilFill size={12} />
            </button>
          )}
        </p>
      )}

      {/* Row 3 — pills */}
      <div className="plan-card-pills">
        <div className="plan-card-pills-left">
          <span
            className={`plan-card-pill plan-card-pill--type-${item.source_type}${item.source_type === "habit" || item.source_type === "task" ? " plan-card-pill--clickable" : ""}`}
            onClick={item.source_type === "habit"
              ? () => navigate(ROUTES.HABIT_LIBRARY_DETAIL.replace(":habitId", String(item.source_id)))
              : item.source_type === "task"
                ? () => navigate(ROUTES.TASK_DETAIL.replace(":taskId", String(item.source_id)))
                : undefined}
          >
            {item.source_type === "habit"
              ? <Bullseye size={11} />
              : item.source_type === "schedule"
                ? <CalendarEvent size={11} />
                : <CheckSquareFill size={11} />}
            {item.source_type === "habit" ? "Habit" : item.source_type === "schedule" ? "Scheduled" : "Task"}
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

        {!readOnly && !existingNote && (
          <button
            type="button"
            className="plan-card-pill plan-card-pill--note plan-card-pill--clickable"
            onClick={() => setNoteOpen(true)}
          >
            <ChatSquareDots size={11} />
            {"Add Note"}
          </button>
        )}
      </div>

      {/* Row 4 — metric progress */}
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
              {target > 100 ? (
                <>
                  {busy || savingProgress ? (
                    <span className="plan-card-check-spinner me-1" role="status" aria-label="Updating status">
                      <span className="spinner-border spinner-border-sm" aria-hidden="true" />
                    </span>
                  ) : (
                    <>
                      {inputDelta && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon border-0 plan-card-progress-action plan-card-progress-action-save"
                          aria-label="Save progress"
                          onClick={() => { void handleSaveProgressDelta(); }}
                          disabled={busy || savingProgress}
                        >
                          <Floppy size={13} />
                        </button>
                      )}
                    </>
                  )}
                  <input
                    type="number"
                    className="plan-card-progress-input"
                    value={inputDelta}
                    placeholder="Add..."
                    min={target * -2}
                    max={target * 2}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (isNaN(val)) { setInputDelta(""); return; }
                      setInputDelta(String(Math.min(Math.max(target * -2, val), target * 2)));
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") void handleSaveProgressDelta(); }}
                    disabled={busy || savingProgress}
                    aria-label="Progress amount to add"
                  />
                </>
              ) : (
                <>
                  {busy || savingProgress ? (
                    <span className="plan-card-check-spinner me-1" role="status" aria-label="Updating status">
                      <span className="spinner-border spinner-border-sm" aria-hidden="true" />
                    </span>
                  ) : (
                    <>
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
                    </>
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
                </>
              )}
            </div>
          )}
        </div>
      )}
      <NoteDialog
        show={noteOpen}
        initialValue={existingNote}
        busy={savingNote}
        onConfirm={(note) => { void handleSaveNote(note); }}
        onCancel={() => setNoteOpen(false)}
        onConfirmAndDone={!isMetric && !isDone && !isMissed && onSaveNoteAndDone
          ? (note) => { void handleSaveNoteAndDone(note); }
          : undefined
        }
      />
    </article>
  );
}
