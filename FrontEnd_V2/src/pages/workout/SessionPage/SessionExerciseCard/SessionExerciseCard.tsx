import { CheckLg, PlusLg, Trash3 } from "react-bootstrap-icons";

import type { SessionExercise, SessionSet } from "@/api";
import { ExerciseThumb } from "@/pages/workout/ExerciseThumb/ExerciseThumb";
import { MuscleChips } from "@/pages/workout/MuscleMap/MuscleMap";
import { formatDose, formatRest } from "@/pages/workout/WorkoutPage.constants";
import "./SessionExerciseCard.scss";

interface SessionExerciseCardProps {
  item: SessionExercise;
  readOnly?: boolean;
  onOpen: () => void;
  onEditSet?: (setIndex: number, patch: Partial<SessionSet>) => void;
  onToggleDone?: (setIndex: number) => void;
  onAddSet?: () => void;
  onRemoveSet?: (setIndex: number) => void;
  onRemove?: () => void;
}

/** What each set is logged as: kg and reps for counted lifts, seconds for timed sets, a bare tick otherwise. */
type SetLogging = "reps" | "seconds" | "tick";

const loggingOf = (item: SessionExercise): SetLogging => {
  if (item.exercise.kind !== "strength") return "tick";
  if (item.exercise.measure === "seconds") return "seconds";
  if (item.exercise.measure === "reps") return "reps";
  return "tick";
};

const numberOrNull = (raw: string): number | null => {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

const formatSet = (s: SessionSet | undefined, logging: SetLogging): string => {
  if (!s) return "–";
  if (logging === "seconds") return s.seconds === null ? "–" : `${s.seconds} sec`;
  if (s.weight_kg === null && s.reps === null) return "–";
  const weight = s.weight_kg === null ? "BW" : `${s.weight_kg}`;
  return s.reps === null ? weight : `${weight} × ${s.reps}`;
};

export function SessionExerciseCard({
  item,
  readOnly = false,
  onOpen,
  onEditSet,
  onToggleDone,
  onAddSet,
  onRemoveSet,
  onRemove,
}: SessionExerciseCardProps) {
  const doneCount = item.sets.filter((s) => s.done).length;
  const allDone = item.sets.length > 0 && doneCount === item.sets.length;
  const logging = loggingOf(item);
  // A finished workout only shows what was actually done, numbered 1..n; the original index
  // is kept so the "previous" column still lines up with the right set.
  const rows = item.sets.map((set, index) => ({ set, index })).filter(({ set }) => !readOnly || set.done);
  const tableModifier = logging === "tick" ? " is-tick-only" : logging === "seconds" ? " is-timed" : "";

  return (
    <section className={`wk-sx surface${allDone ? " is-complete" : ""}`}>
      <header className="wk-sx-head">
        <button type="button" className="wk-sx-title" onClick={onOpen} aria-label={`Details for ${item.exercise.name}`}>
          <span className="wk-sx-thumb">
            <ExerciseThumb exercise={item.exercise} imageUrl={item.exercise.image_url} mapSize="xs" />
          </span>
          <span className="wk-sx-name">
            <strong>{item.exercise.name}</strong>
            <MuscleChips primary={item.exercise.primary_muscles} max={3} />
          </span>
        </button>

        <div className="wk-sx-side">
          <span className="wk-sx-target">
            {formatDose(item.exercise.measure, item.target_sets, item.target_reps)}
            <small>rest {formatRest(item.rest_seconds)}</small>
          </span>
          {!readOnly && onRemove && (
            <button type="button" className="wk-sx-icon" aria-label={`Remove ${item.exercise.name}`} onClick={onRemove}>
              <Trash3 size={15} />
            </button>
          )}
        </div>
      </header>

      <div className={`wk-sx-table${tableModifier}`} role="table" aria-label={`${item.exercise.name} sets`}>
        <div className="wk-sx-row wk-sx-row--head" role="row">
          <span role="columnheader">Set</span>
          <span role="columnheader">Previous</span>
          {logging === "reps" && (
            <>
              <span role="columnheader">kg</span>
              <span role="columnheader">Reps</span>
            </>
          )}
          {logging === "seconds" && <span role="columnheader">Seconds</span>}
          <span role="columnheader" className="visually-hidden">Done</span>
        </div>

        {rows.map(({ set: s, index: i }, n) => (
          <div key={i} className={`wk-sx-row${s.done ? " is-done" : ""}`} role="row">
            <span className="wk-sx-num" role="cell">{n + 1}</span>
            <span className="wk-sx-prev" role="cell">{formatSet(item.previous_sets[i], logging)}</span>

            {readOnly ? (
              <>
                {logging === "reps" && (
                  <>
                    <span className="wk-sx-val" role="cell">{s.weight_kg ?? "BW"}</span>
                    <span className="wk-sx-val" role="cell">{s.reps ?? "–"}</span>
                  </>
                )}
                {logging === "seconds" && (
                  <span className="wk-sx-val" role="cell">{s.seconds === null ? "–" : `${s.seconds} sec`}</span>
                )}
                <span className={`wk-sx-tick${s.done ? " is-on" : ""}`} role="cell">{s.done && <CheckLg size={14} aria-label="Done" />}</span>
              </>
            ) : (
              <>
                {logging === "reps" && (
                  <>
                    <input
                      className="wk-sx-input"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={0.5}
                      placeholder="–"
                      aria-label={`Set ${i + 1} weight in kilograms`}
                      value={s.weight_kg ?? ""}
                      onChange={(e) => onEditSet?.(i, { weight_kg: numberOrNull(e.target.value) })}
                    />
                    <input
                      className="wk-sx-input"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      placeholder="–"
                      aria-label={`Set ${i + 1} reps`}
                      value={s.reps ?? ""}
                      onChange={(e) => onEditSet?.(i, { reps: numberOrNull(e.target.value) })}
                    />
                  </>
                )}
                {logging === "seconds" && (
                  <input
                    className="wk-sx-input"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    placeholder="–"
                    aria-label={`Set ${i + 1} seconds`}
                    value={s.seconds ?? ""}
                    onChange={(e) => onEditSet?.(i, { seconds: numberOrNull(e.target.value) })}
                  />
                )}
                <button
                  type="button"
                  className={`wk-sx-tick${s.done ? " is-on" : ""}`}
                  aria-pressed={s.done}
                  aria-label={`Mark set ${i + 1} ${s.done ? "not done" : "done"}`}
                  onClick={() => onToggleDone?.(i)}
                >
                  <CheckLg size={16} />
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {!readOnly && (
        <footer className="wk-sx-foot">
          <button type="button" className="wk-sx-add" onClick={onAddSet}><PlusLg size={12} /> Add set</button>
          {item.sets.length > 1 && (
            <button type="button" className="wk-sx-drop" onClick={() => onRemoveSet?.(item.sets.length - 1)}>Remove last set</button>
          )}
          <span className="wk-sx-count">{doneCount}/{item.sets.length} done</span>
        </footer>
      )}
    </section>
  );
}
