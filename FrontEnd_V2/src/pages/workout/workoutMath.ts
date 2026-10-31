import type { ExerciseSummary, MuscleId, MuscleSets } from "@/api/types";

interface HasExercise {
  exercise: ExerciseSummary;
}

interface HasVolume extends HasExercise {
  sets: number;
}

// Cardio and warm-ups are not muscle work. The backend leaves them out of plan and session muscle totals too,
// so every page that adds up muscles or sets goes through this rule.
const isMuscleWork = (exercise: ExerciseSummary) => exercise.kind === "strength";

/**
 * Muscles a list of exercises trains: every primary muscle, plus secondaries that aren't already primary.
 * Cardio and warm-ups are left out.
 */
export function musclesOf(items: HasExercise[]): { primary: MuscleId[]; secondary: MuscleId[] } {
  const primary = new Set<MuscleId>();
  const secondary = new Set<MuscleId>();
  for (const { exercise } of items) {
    if (!isMuscleWork(exercise)) continue;
    exercise.primary_muscles.forEach((m) => primary.add(m));
    exercise.secondary_muscles.forEach((m) => secondary.add(m));
  }
  return { primary: [...primary], secondary: [...secondary].filter((m) => !primary.has(m)) };
}

/**
 * Training volume per muscle: a set counts fully for each primary muscle and half for each
 * secondary one, which is how most programme planners estimate it. Cardio and warm-ups are left out.
 */
export function setsByMuscle(items: HasVolume[]): MuscleSets[] {
  const totals = new Map<MuscleId, number>();
  for (const { exercise, sets } of items) {
    if (!isMuscleWork(exercise)) continue;
    exercise.primary_muscles.forEach((m) => totals.set(m, (totals.get(m) ?? 0) + sets));
    exercise.secondary_muscles.forEach((m) => totals.set(m, (totals.get(m) ?? 0) + sets / 2));
  }
  return [...totals.entries()]
    .map(([muscle, sets]) => ({ muscle, sets: Math.round(sets * 2) / 2 }))
    .sort((a, b) => b.sets - a.sets);
}

/** Sets a training day is built around: strength sets only, under the same rule as muscle work. */
export function workingSetCount(items: HasVolume[]): number {
  return items.reduce((total, { exercise, sets }) => total + (isMuscleWork(exercise) && Number.isFinite(sets) ? sets : 0), 0);
}

const SECONDS_PER_SET = 45;
const SETUP_MINUTES = 5;
const TIMED_REPS = /(\d+)\s*(min|sec)\b/;

// A timed dose such as "20 min" or "30 sec" says how long one set takes; anything else gets the usual allowance.
function secondsPerSet(reps: string): number {
  const match = TIMED_REPS.exec(reps);
  return match ? Number(match[1]) * (match[2] === "min" ? 60 : 1) : SECONDS_PER_SET;
}

/** Rough session length: time under tension plus rest for every set, plus a few minutes of setup. */
export function estimateMinutes(rows: { sets: number; rest_seconds: number; reps: string }[]): number {
  if (rows.length === 0) return 0;
  const seconds = rows.reduce((total, r) => total + r.sets * (secondsPerSet(r.reps) + r.rest_seconds), 0);
  return Math.round(seconds / 60) + SETUP_MINUTES;
}

export function formatSetCount(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
