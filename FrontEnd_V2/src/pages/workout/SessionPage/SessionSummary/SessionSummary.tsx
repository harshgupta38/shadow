import { useMemo } from "react";
import { ArrowLeft, CheckCircleFill, Trash3Fill } from "react-bootstrap-icons";
import { useNavigate } from "react-router-dom";

import type { WorkoutSessionDetail } from "@/api";
import { useDateFormat } from "@/context/PlannerContext";
import { formatDisplayDate } from "@/services/date.service";
import { ROUTES } from "@/routes/RoutePaths";
import { MuscleChips, MuscleLegend, MuscleMap } from "@/pages/workout/MuscleMap/MuscleMap";
import { SessionExerciseCard } from "@/pages/workout/SessionPage/SessionExerciseCard/SessionExerciseCard";
import { formatSessionDuration, formatVolume, pluralize } from "@/pages/workout/WorkoutPage.constants";
import { musclesOf } from "@/pages/workout/workoutMath";
import "./SessionSummary.scss";

interface SessionSummaryProps {
  session: WorkoutSessionDetail;
  /** True right after finishing, to celebrate; false when reviewing an old session. */
  justFinished: boolean;
  deleting?: boolean;
  onBack: () => void;
  onDelete: () => void;
}

export function SessionSummary({ session, justFinished, deleting = false, onBack, onDelete }: SessionSummaryProps) {
  const dateFormat = useDateFormat();
  const navigate = useNavigate();

  // Only exercises with at least one logged set count as trained.
  const trained = useMemo(() => session.exercises.filter((e) => e.sets.some((s) => s.done)), [session.exercises]);
  const muscles = useMemo(() => musclesOf(trained), [trained]);

  return (
    <div className="wk-sum">
      <button type="button" className="wk-sum-back" onClick={onBack}>
        <ArrowLeft size={16} /> Back to workout
      </button>

      <header className={`wk-sum-hero surface${justFinished ? " is-new" : ""}`}>
        <span className="wk-sum-badge"><CheckCircleFill size={26} aria-hidden="true" /></span>
        <div className="wk-sum-hero-text">
          <h1>{justFinished ? "Workout complete" : session.name}</h1>
          <p>
            {justFinished ? `${session.name} · ` : ""}
            {formatDisplayDate(session.date, dateFormat)}
            {session.plan_name ? ` · ${session.plan_name}` : ""}
          </p>
        </div>
      </header>

      <div className="wk-sum-stats">
        <div><strong>{formatSessionDuration(session.duration_seconds)}</strong><span>time</span></div>
        <div><strong>{formatVolume(session.volume_kg)}</strong><span>volume</span></div>
        <div><strong>{session.sets_done}</strong><span>sets done</span></div>
        <div><strong>{trained.length}</strong><span>{trained.length === 1 ? "exercise" : "exercises"}</span></div>
      </div>

      <div className="wk-sum-grid">
        <div className="wk-sum-main">
          {trained.length === 0 ? (
            <p className="wk-sum-none">No sets were logged in this workout.</p>
          ) : (
            trained.map((item) => (
              <SessionExerciseCard key={item.id ?? item.exercise.id} item={item} readOnly onOpen={() => navigate(ROUTES.WORKOUT_EXERCISE.replace(":exerciseId", String(item.exercise.id)))} />
            ))
          )}
          {session.note && (
            <section className="surface wk-sum-note">
              <h2>Notes</h2>
              <p>{session.note}</p>
            </section>
          )}
        </div>

        <aside className="wk-sum-aside">
          {muscles.primary.length + muscles.secondary.length > 0 && (
            <section className="surface wk-sum-card">
              <header>
                <h2>Muscles trained</h2>
                <MuscleLegend />
              </header>
              <MuscleMap size="md" primary={muscles.primary} secondary={muscles.secondary} />
              <MuscleChips primary={muscles.primary} secondary={muscles.secondary} />
            </section>
          )}

          <button type="button" className="wk-sum-delete" disabled={deleting} onClick={onDelete}>
            <Trash3Fill size={13} /> {deleting ? "Deleting…" : `Delete this workout (${pluralize(session.sets_done, "set")})`}
          </button>
        </aside>
      </div>
    </div>
  );
}
