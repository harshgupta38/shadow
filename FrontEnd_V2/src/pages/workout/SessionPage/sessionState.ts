import type { ExerciseSummary, SessionExercise, SessionSaveRequest, SessionSet } from "@/api/types";

const DEFAULT_SETS = 3;
const DEFAULT_REPS = "8-12";
const DEFAULT_REST_SECONDS = 90;

/** "8-12" → 8, "12" → 12, "30s" → 30, "AMRAP" → null. */
export function firstNumber(text: string): number | null {
  const match = text.match(/\d+/);
  return match ? Number(match[0]) : null;
}

export function emptySet(weight: number | null = null): SessionSet {
  return { reps: null, weight_kg: weight, done: false };
}

/** An exercise added on the fly during a workout. */
export function newSessionExercise(exercise: ExerciseSummary): SessionExercise {
  return {
    id: null,
    exercise,
    target_sets: DEFAULT_SETS,
    target_reps: DEFAULT_REPS,
    rest_seconds: DEFAULT_REST_SECONDS,
    note: null,
    sets: Array.from({ length: DEFAULT_SETS }, () => emptySet()),
    previous_sets: [],
  };
}

/**
 * When a set is ticked off with empty boxes, fill them with what the user most likely did: the same
 * set last time, else the set before it in this workout, else the first number of the rep target.
 */
export function prefillSet(item: SessionExercise, index: number): SessionSet {
  const set = item.sets[index];
  const previous = item.previous_sets[index];
  const lastDone = [...item.sets.slice(0, index)].reverse().find((s) => s.done);
  return {
    ...set,
    weight_kg: set.weight_kg ?? previous?.weight_kg ?? lastDone?.weight_kg ?? null,
    reps: set.reps ?? previous?.reps ?? lastDone?.reps ?? firstNumber(item.target_reps),
  };
}

export function totals(exercises: SessionExercise[]) {
  let done = 0;
  let planned = 0;
  let volume = 0;
  for (const e of exercises) {
    for (const s of e.sets) {
      planned += 1;
      if (s.done) {
        done += 1;
        volume += (s.weight_kg ?? 0) * (s.reps ?? 0);
      }
    }
  }
  return { done, planned, volume };
}

export function toSaveRequest(exercises: SessionExercise[], note: string | null): SessionSaveRequest {
  return {
    note,
    exercises: exercises.map((e) => ({ id: e.id, exercise_id: e.exercise.id, sets: e.sets, note: e.note })),
  };
}

/**
 * After a save, give exercises that were added locally the ids the server assigned, without
 * touching anything the user may have typed while the request was in flight.
 */
export function adoptServerIds(local: SessionExercise[], server: SessionExercise[]): SessionExercise[] {
  if (local.length !== server.length) return local;
  return local.map((item, i) =>
    item.id === null && server[i].exercise.id === item.exercise.id ? { ...item, id: server[i].id } : item,
  );
}
