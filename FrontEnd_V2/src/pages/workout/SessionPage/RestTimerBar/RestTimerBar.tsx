import { PlusLg, SkipEndFill, StopwatchFill } from "react-bootstrap-icons";

import { formatClock } from "@/pages/workout/WorkoutPage.constants";
import "./RestTimerBar.scss";

interface RestTimerBarProps {
  exerciseName: string;
  remainingSeconds: number;
  totalSeconds: number;
  onSkip: () => void;
  onAddSeconds: (seconds: number) => void;
}

const EXTEND_SECONDS = 30;

// Sticks to the bottom of the page while resting between sets. Counts down, then says so.
export function RestTimerBar({ exerciseName, remainingSeconds, totalSeconds, onSkip, onAddSeconds }: RestTimerBarProps) {
  const over = remainingSeconds <= 0;
  const pct = totalSeconds > 0 ? Math.max(0, Math.min(100, (remainingSeconds / totalSeconds) * 100)) : 0;

  return (
    <div className={`wk-rest${over ? " is-over" : ""}`} role="timer" aria-live={over ? "polite" : "off"}>
      <StopwatchFill size={20} aria-hidden="true" />
      <div className="wk-rest-text">
        <strong>{over ? "Rest over. Next set!" : `Rest ${formatClock(remainingSeconds)}`}</strong>
        <span>{exerciseName}</span>
      </div>
      <div className="wk-rest-actions">
        {!over && (
          <button type="button" onClick={() => onAddSeconds(EXTEND_SECONDS)} aria-label={`Add ${EXTEND_SECONDS} seconds`}>
            <PlusLg size={11} /> {EXTEND_SECONDS}s
          </button>
        )}
        <button type="button" onClick={onSkip}>
          <SkipEndFill size={13} /> {over ? "Dismiss" : "Skip"}
        </button>
      </div>
      <span className="wk-rest-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
    </div>
  );
}
