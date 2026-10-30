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
const MAX_REPS_TEXT = 12;

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

/** Sensible starting numbers: heavy compound lifts get fewer reps and more rest than isolation work. */
export function newDraftExercise(exercise: ExerciseSummary): DraftExercise {
  const compound = exercise.mechanic === "compound";
  return {
    key: nextKey(),
    exercise,
    sets: compound ? 4 : 3,
    reps: compound ? "6-10" : "10-15",
    rest_seconds: compound ? 120 : 60,
    weight_kg: null,
    note: null,
  };
}

export function newDraftDay(weekday: number): DraftDay {
  return { weekday, name: `${WEEKDAY_LONG[weekday]} workout`, exercises: [] };
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
        sets: e.sets,
        reps: e.reps.trim(),
        rest_seconds: e.rest_seconds,
        weight_kg: e.weight_kg,
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
      if (!Number.isInteger(e.sets) || e.sets < 1 || e.sets > MAX_SETS) {
        problems.push(`${label}: ${e.exercise.name} needs between 1 and ${MAX_SETS} sets.`);
      }
      if (!e.reps.trim() || e.reps.trim().length > MAX_REPS_TEXT) {
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
