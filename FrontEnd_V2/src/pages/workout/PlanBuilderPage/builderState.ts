import type {
  ExerciseSummary,
  WorkoutGoal,
  WorkoutLevel,
  WorkoutPlanDetail,
  WorkoutPlanSaveRequest,
} from "@/api/types";
import { WEEKDAY_LONG } from "@/pages/workout/WorkoutPage.constants";

export interface DraftExercise {
  /** Stable React / drag-and-drop key; unrelated to anything on the server. */
  key: string;
  exercise: ExerciseSummary;
  sets: number;
  reps: string;
  rest_seconds: number;
  weight_kg: number | null;
  note: string | null;
}

export interface DraftDay {
  weekday: number;
  name: string;
  exercises: DraftExercise[];
}

export interface PlanDraft {
  name: string;
  description: string;
  goal: WorkoutGoal;
  level: WorkoutLevel;
  days: DraftDay[]; // one per training weekday
}

export const REST_OPTIONS = [30, 45, 60, 75, 90, 120, 150, 180, 240, 300];

export const MAX_NAME = 80;
export const MAX_DESCRIPTION = 500;
export const MAX_SETS = 20;
export const MAX_CARDIO_MINUTES = 240;
export const MIN_SECONDS_PER_SET = 5;
export const MAX_SECONDS_PER_SET = 600;
const MAX_REPS_TEXT = 12;
const TIMED_TEXT = /\d\s*(min|sec)\b/i; // a time, which a counted-reps row must not carry

let keyCounter = 0;
const nextKey = () => `x${++keyCounter}`;

export const EMPTY_DRAFT: PlanDraft = {
  name: "",
  description: "",
  goal: "build_muscle",
  level: "beginner",
  days: [],
};

export function draftFromPlan(plan: WorkoutPlanDetail): PlanDraft {
  return {
    name: plan.name,
    description: plan.description,
    goal: plan.goal,
    level: plan.level,
    days: [...plan.days]
      .sort((a, b) => a.weekday - b.weekday)
      .map((d) => ({
        weekday: d.weekday,
        name: d.name,
        exercises: d.exercises.map((e) => ({
          key: nextKey(),
          exercise: e.exercise,
          sets: e.sets,
          reps: e.reps,
          rest_seconds: e.rest_seconds,
          weight_kg: e.weight_kg,
          note: e.note,
        })),
      })),
  };
}

/** The minutes in a timed block such as "20 min"; null for anything else. */
export function minutesOf(reps: string): number | null {
  const match = reps.trim().match(/^(\d+)\s*min$/i);
  return match ? Number(match[1]) : null;
}

/** The seconds per set in a timed target such as "30 sec"; null for anything else. */
export function secondsOf(reps: string): number | null {
  const match = reps.trim().match(/^(\d+)\s*sec$/i);
  return match ? Number(match[1]) : null;
}

/** Starting numbers come from the library: one timed block for minutes, the library's sets, time and rest otherwise. */
export function newDraftExercise(exercise: ExerciseSummary): DraftExercise {
  if (exercise.measure === "minutes") {
    // One timed block, with no rest and no weight.
    return { key: nextKey(), exercise, sets: 1, reps: exercise.default_reps, rest_seconds: 0, weight_kg: null, note: null };
  }
  return {
    key: nextKey(),
    exercise,
    sets: exercise.default_sets,
    reps: exercise.default_reps,
    rest_seconds: exercise.default_rest_seconds,
    weight_kg: null,
    note: null,
  };
}

export function newDraftDay(weekday: number): DraftDay {
  return { weekday, name: `${WEEKDAY_LONG[weekday]} workout`, exercises: [] };
}

/** Fresh copies of another day's exercises — same sets/reps/rest/weight, new keys so drag-and-drop and React stay happy. */
export function cloneDayExercises(exercises: DraftExercise[]): DraftExercise[] {
  return exercises.map((e) => ({ ...e, key: nextKey() }));
}

export function toSaveRequest(draft: PlanDraft): WorkoutPlanSaveRequest {
  return {
    name: draft.name.trim(),
    description: draft.description.trim(),
    goal: draft.goal,
    level: draft.level,
    days: draft.days.map((d) => ({
      weekday: d.weekday,
      name: d.name.trim(),
      exercises: d.exercises.map((e) => ({
        exercise_id: e.exercise.id,
        // A timed block is saved as one set with no rest; only counted reps carry weight.
        sets: e.exercise.measure === "minutes" ? 1 : e.sets,
        reps: e.reps.trim(),
        rest_seconds: e.exercise.measure === "minutes" ? 0 : e.rest_seconds,
        weight_kg: e.exercise.measure === "reps" ? e.weight_kg : null,
        note: e.note,
      })),
    })),
  };
}

/** Everything that stops a plan being saved, as plain sentences for the user. */
export function validateDraft(draft: PlanDraft): string[] {
  const problems: string[] = [];
  if (!draft.name.trim()) problems.push("Give your plan a name.");
  if (draft.days.length === 0) problems.push("Add at least one training day.");

  for (const day of draft.days) {
    const label = WEEKDAY_LONG[day.weekday];
    if (!day.name.trim()) problems.push(`${label} needs a name.`);
    if (day.exercises.length === 0) problems.push(`${label} has no exercises yet.`);
    for (const e of day.exercises) {
      if (e.exercise.measure === "minutes") {
        const minutes = minutesOf(e.reps);
        if (minutes === null || minutes < 1 || minutes > MAX_CARDIO_MINUTES) {
          problems.push(`${label}: ${e.exercise.name} needs a time between 1 and ${MAX_CARDIO_MINUTES} minutes.`);
        }
        continue;
      }
      if (!Number.isInteger(e.sets) || e.sets < 1 || e.sets > MAX_SETS) {
        problems.push(`${label}: ${e.exercise.name} needs between 1 and ${MAX_SETS} sets.`);
      }
      if (e.exercise.measure === "seconds") {
        const seconds = secondsOf(e.reps);
        if (seconds === null || seconds < MIN_SECONDS_PER_SET || seconds > MAX_SECONDS_PER_SET) {
          problems.push(`${label}: ${e.exercise.name} needs a time per set between ${MIN_SECONDS_PER_SET} and ${MAX_SECONDS_PER_SET} seconds.`);
        }
      } else if (!e.reps.trim() || e.reps.trim().length > MAX_REPS_TEXT || TIMED_TEXT.test(e.reps)) {
        problems.push(`${label}: ${e.exercise.name} needs a rep target such as 8-12.`);
      }
    }
  }
  return problems;
}

/** A comparable snapshot, used to tell whether the user has unsaved changes. */
export function snapshot(draft: PlanDraft): string {
  return JSON.stringify({
    ...draft,
    days: draft.days.map((d) => ({ ...d, exercises: d.exercises.map(({ key: _key, exercise, ...rest }) => ({ id: exercise.id, ...rest })) })),
  });
}
