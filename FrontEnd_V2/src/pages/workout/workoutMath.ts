import type { ExerciseSummary, MuscleId, MuscleSets } from "@/api/types";

interface HasExercise {
  exercise: ExerciseSummary;
}

interface HasVolume extends HasExercise {
  sets: number;
}

/** Muscles a list of exercises trains: every primary muscle, plus secondaries that aren't already primary. */
export function musclesOf(items: HasExercise[]): { primary: MuscleId[]; secondary: MuscleId[] } {
  const primary = new Set<MuscleId>();
  const secondary = new Set<MuscleId>();
  for (const { exercise } of items) {
    exercise.primary_muscles.forEach((m) => primary.add(m));
    exercise.secondary_muscles.forEach((m) => secondary.add(m));
  }
  return { primary: [...primary], secondary: [...secondary].filter((m) => !primary.has(m)) };
}

/**
 * Training volume per muscle: a set counts fully for each primary muscle and half for each
 * secondary one, which is how most programme planners estimate it.
 */
export function setsByMuscle(items: HasVolume[]): MuscleSets[] {
  const totals = new Map<MuscleId, number>();
  for (const { exercise, sets } of items) {
    exercise.primary_muscles.forEach((m) => totals.set(m, (totals.get(m) ?? 0) + sets));
    exercise.secondary_muscles.forEach((m) => totals.set(m, (totals.get(m) ?? 0) + sets / 2));
  }
  return [...totals.entries()]
    .map(([muscle, sets]) => ({ muscle, sets: Math.round(sets * 2) / 2 }))
    .sort((a, b) => b.sets - a.sets);
}

const SECONDS_PER_SET = 45;
const SETUP_MINUTES = 5;

/** Rough session length: time under tension plus rest for every set, plus a few minutes of setup. */
export function estimateMinutes(rows: { sets: number; rest_seconds: number }[]): number {
  if (rows.length === 0) return 0;
  const seconds = rows.reduce((total, r) => total + r.sets * (SECONDS_PER_SET + r.rest_seconds), 0);
  return Math.round(seconds / 60) + SETUP_MINUTES;
}

export function formatSetCount(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
