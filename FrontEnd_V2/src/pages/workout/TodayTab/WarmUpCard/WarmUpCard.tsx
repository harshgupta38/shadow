import { useEffect, useState } from "react";
import { ArrowCounterclockwise, CheckCircleFill, CheckLg, PlayFill, StopwatchFill } from "react-bootstrap-icons";

import type { WarmUpItem } from "@/api";
import { ExerciseThumb } from "@/pages/workout/ExerciseThumb/ExerciseThumb";
import { MuscleChips } from "@/pages/workout/MuscleMap/MuscleMap";
import { WorkoutSkeleton } from "@/pages/workout/WorkoutSkeleton/WorkoutSkeleton";
import type { WarmUpController } from "@/pages/workout/TodayTab/WarmUpCard/useWarmUp";
import { warmUpDose } from "@/pages/workout/TodayTab/WarmUpCard/WarmUpCard.constants";
import { KIND_LABEL, formatClock, pluralize } from "@/pages/workout/WorkoutPage.constants";
import "./WarmUpCard.scss";

interface WarmUpCardProps {
  warmUp: WarmUpController;
  dayName: string;
  onOpenExercise: (id: number) => void;
}

function ExerciseInfo({ item, onOpen }: { item: WarmUpItem; onOpen: (id: number) => void }) {
  const { exercise } = item;
  return (
    <button type="button" className="wk-wu-open" onClick={() => onOpen(exercise.id)} aria-label={`How to do ${exercise.name}`}>
      <span className="wk-wu-thumb">
        <ExerciseThumb exercise={exercise} imageUrl={exercise.image_url} mapSize="xs" />
      </span>
      <span className="wk-wu-info">
        <span className="wk-wu-name">{exercise.name}</span>
        <MuscleChips primary={exercise.primary_muscles} max={2} />
      </span>
      <span className="wk-wu-dose">
        <strong>{warmUpDose(item)}</strong>
        <small>{KIND_LABEL[exercise.kind]}</small>
      </span>
    </button>
  );
}

export function WarmUpCard({ warmUp, dayName, onOpenExercise }: WarmUpCardProps) {
  const { phase, routine, doneIds, startedAt, finishedAt } = warmUp;

  // The clock only ticks while the warm-up is running.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (phase !== "active") return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  if (!warmUp.enabled) return null;

  if (warmUp.loadState === "loading") {
    return (
      <section className="surface wk-wu" aria-hidden="true">
        <WorkoutSkeleton height={200} />
      </section>
    );
  }

  if (warmUp.loadState === "error") {
    return (
      <section className="surface wk-wu wk-wu--note" role="status">
        <p>{warmUp.error ?? "Could not load your warm-up right now."}</p>
        <button type="button" className="btn btn-soft btn-sm" onClick={warmUp.retry}>Try again</button>
      </section>
    );
  }

  if (!routine || routine.items.length === 0) return null;

  const total = routine.items.length;
  const done = routine.items.filter((item) => doneIds.includes(item.exercise.id)).length;
  const elapsed = startedAt === null ? 0 : Math.max(0, Math.floor(((finishedAt ?? now) - startedAt) / 1000));

  const active = phase === "active";
  const finished = phase === "done";
  // After a discard the card stays as it was, but Start workout is the main action again.
  const discarded = phase === "skipped";
  const complete = done === total;

  return (
    <section className={`surface wk-wu${active ? " is-active" : ""}${finished ? " is-done" : ""}`} aria-label="Warm-up">
      <header className="wk-wu-head">
        <div className="wk-wu-heading">
          <span className="wk-wu-eyebrow">
            {active ? "Warm-up in progress" : finished ? "Warm-up done" : `Warm-up · before ${dayName}`}
          </span>
          <h2 className="wk-wu-title">
            {active ? `${done} of ${total} done` : finished ? (complete ? "Warm-up complete" : `${done} of ${total} exercises done`) : "Get your body ready"}
          </h2>
          <p className="wk-wu-sub">
            {active ? (
              <>
                <StopwatchFill size={12} aria-hidden="true" /> {formatClock(elapsed)} · ~{routine.estimated_minutes} min total
              </>
            ) : finished ? (
              <>
                <CheckCircleFill size={12} aria-hidden="true" />
                {elapsed > 0 ? ` ${formatClock(elapsed)} · ` : " "}
                {complete ? "Your muscles are primed. Time to lift." : "Every bit helps. Time to lift."}
              </>
            ) : (
              <>
                {pluralize(total, "exercise")} · ~{routine.estimated_minutes} min · helps prevent cramps and injury
              </>
            )}
          </p>
        </div>

        {active ? (
          <div className="wk-wu-actions">
            <button type="button" className="btn btn-outline-secondary btn-sm wk-wu-discard" onClick={warmUp.skip}>
              Discard
            </button>
            <button
              type="button"
              className="btn btn-brand btn-sm"
              disabled={done === 0}
              title={done === 0 ? "Tick at least one exercise, or discard the warm-up" : undefined}
              onClick={warmUp.finish}
            >
              Done
            </button>
          </div>
        ) : finished ? (
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={warmUp.reset}>
            <ArrowCounterclockwise size={13} aria-hidden="true" /> Redo
          </button>
        ) : (
          <button type="button" className={`btn ${discarded ? "btn-soft" : "btn-brand"} wk-wu-cta`} onClick={warmUp.start}>
            <PlayFill size={18} aria-hidden="true" /> Start warm-up
          </button>
        )}

        {(active || finished) && (
          <span
            className="wk-wu-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={done}
            aria-label="Warm-up progress"
          >
            <span style={{ width: `${(done / total) * 100}%` }} />
          </span>
        )}
      </header>

      <ol className="wk-wu-list">
        {routine.items.map((item) => {
          const ticked = doneIds.includes(item.exercise.id);
          return (
            <li key={item.exercise.id} className={`wk-wu-row${ticked ? " is-ticked" : ""}${active || finished ? " has-tick" : ""}`}>
              {active && (
                <button
                  type="button"
                  className={`wk-wu-tick${ticked ? " is-on" : ""}`}
                  aria-pressed={ticked}
                  aria-label={`Mark ${item.exercise.name} ${ticked ? "not done" : "done"}`}
                  onClick={() => warmUp.toggle(item.exercise.id)}
                >
                  <CheckLg size={16} aria-hidden="true" />
                </button>
              )}
              {finished && (
                <span className={`wk-wu-tick is-static${ticked ? " is-on" : ""}`} role="img" aria-label={ticked ? "Done" : "Not done"}>
                  {ticked && <CheckLg size={16} aria-hidden="true" />}
                </span>
              )}
              <ExerciseInfo item={item} onOpen={onOpenExercise} />
            </li>
          );
        })}
      </ol>

      <p className="wk-wu-tip">
        {active
          ? "Tick each one as you finish it, or tap it to see how it's done."
          : "After this, do 1–2 light sets of your first lift before the heavy ones."}
      </p>
    </section>
  );
}
