import type { ExerciseSummary, SessionExercise, SessionSaveRequest, SessionSet } from "@/api/types";

/** "8-12" → 8, "12" → 12, "30 sec" → 30, "AMRAP" → null. */
function firstNumber(text: string): number | null {
  const match = text.match(/\d+/);
  return match ? Number(match[0]) : null;
}

export function emptySet(weight: number | null = null): SessionSet {
  return { reps: null, seconds: null, weight_kg: weight, done: false };
}

/** An exercise added on the fly during a workout. It starts from the library's own targets, as a plan day would. */
export function newSessionExercise(exercise: ExerciseSummary): SessionExercise {
  return {
    id: null,
    exercise,
    target_sets: exercise.default_sets,
    target_reps: exercise.default_reps,
    rest_seconds: exercise.default_rest_seconds,
    note: null,
    sets: Array.from({ length: exercise.default_sets }, () => emptySet()),
    previous_sets: [],
  };
}

/**
 * When a set is ticked off with empty boxes, fill them with what the user most likely did: the same
 * set last time, else the set before it in this workout, else the first number of the target.
 */
export function prefillSet(item: SessionExercise, index: number): SessionSet {
  const set = item.sets[index];
  // Cardio, blocks of time and warm-ups are a single tick, so there is nothing to fill in.
  if (item.exercise.kind !== "strength" || item.exercise.measure === "minutes") return set;
  const previous = item.previous_sets[index];
  const lastDone = [...item.sets.slice(0, index)].reverse().find((s) => s.done);
  if (item.exercise.measure === "seconds") {
    return { ...set, seconds: set.seconds ?? previous?.seconds ?? lastDone?.seconds ?? firstNumber(item.target_reps) };
  }
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
