import type {
  ExerciseEquipmentType,
  ExerciseKind,
  ExerciseMeasure,
  ExerciseMechanic,
  ExerciseSummary,
  MuscleId,
  MuscleSets,
  WorkoutEquipment,
  WorkoutGoal,
  WorkoutLevel,
  WorkoutPlanSource,
} from "@/api/types";
import { formatDuration } from "@/services/date.service";

// ── Muscles ──────────────────────────────────────────────────────────────────

export const MUSCLE_LABEL: Record<MuscleId, string> = {
  chest: "Chest",
  shoulders: "Shoulders",
  traps: "Traps",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  abs: "Abs",
  obliques: "Obliques",
  lats: "Lats",
  lower_back: "Lower back",
  glutes: "Glutes",
  quads: "Quads",
  hamstrings: "Hamstrings",
  calves: "Calves",
};

interface MuscleGroup {
  id: string;
  label: string;
  muscles: MuscleId[];
}

// Coarse groups used for filtering.
export const MUSCLE_GROUPS: MuscleGroup[] = [
  { id: "chest", label: "Chest", muscles: ["chest"] },
  { id: "back", label: "Back", muscles: ["lats", "traps", "lower_back"] },
  { id: "shoulders", label: "Shoulders", muscles: ["shoulders"] },
  { id: "arms", label: "Arms", muscles: ["biceps", "triceps", "forearms"] },
  { id: "core", label: "Core", muscles: ["abs", "obliques"] },
  { id: "legs", label: "Legs", muscles: ["quads", "hamstrings", "glutes", "calves"] },
];

/** Which muscles are drawn on each side of the body diagram. */
export const FRONT_VISIBLE: MuscleId[] = ["chest", "shoulders", "traps", "biceps", "forearms", "abs", "obliques", "quads", "calves"];
export const BACK_VISIBLE: MuscleId[] = ["traps", "shoulders", "triceps", "forearms", "lats", "lower_back", "glutes", "hamstrings", "calves"];

// ── Exercise / plan vocabulary ───────────────────────────────────────────────

export const EQUIPMENT_LABEL: Record<WorkoutEquipment, string> = {
  bodyweight: "Bodyweight",
  dumbbell: "Dumbbell",
  barbell: "Barbell",
  machine: "Machine",
  cable: "Cable",
  kettlebell: "Kettlebell",
  band: "Resistance band",
  other: "Other",
};

export const LEVEL_LABEL: Record<WorkoutLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export const LEVEL_PILL: Record<WorkoutLevel, string> = {
  beginner: "pill-success",
  intermediate: "pill-warn",
  advanced: "pill-danger",
};

export const GOAL_LABEL: Record<WorkoutGoal, string> = {
  build_muscle: "Build muscle",
  lose_fat: "Lose fat",
  strength: "Get stronger",
  endurance: "Endurance",
  general_fitness: "General fitness",
};

export const MECHANIC_LABEL: Record<ExerciseMechanic, string> = {
  compound: "Compound",
  isolation: "Isolation",
};

export const SOURCE_LABEL: Record<WorkoutPlanSource, string> = {
  predefined: "Ready-made",
  custom: "Mine",
};

export const EQUIPMENT_OPTIONS = (Object.keys(EQUIPMENT_LABEL) as WorkoutEquipment[]).map((value) => ({
  value,
  label: EQUIPMENT_LABEL[value],
}));

export const EQUIPMENT_TYPE_LABEL: Record<ExerciseEquipmentType, string> = {
  no_equipment: "No equipment",
  light_equipment: "Light equipment",
  heavy_equipment: "Heavy equipment",
};
export const EQUIPMENT_TYPE_OPTIONS = (Object.keys(EQUIPMENT_TYPE_LABEL) as ExerciseEquipmentType[]).map((value) => ({
  value,
  label: EQUIPMENT_TYPE_LABEL[value],
}));
export const LEVEL_OPTIONS = (Object.keys(LEVEL_LABEL) as WorkoutLevel[]).map((value) => ({ value, label: LEVEL_LABEL[value] }));
export const KIND_LABEL: Record<ExerciseKind, string> = { strength: "Strength", cardio: "Cardio", warmup: "Warm-up" };
export const KIND_OPTIONS = (Object.keys(KIND_LABEL) as ExerciseKind[]).map((value) => ({ value, label: KIND_LABEL[value] }));
export const GOAL_OPTIONS = (Object.keys(GOAL_LABEL) as WorkoutGoal[]).map((value) => ({ value, label: GOAL_LABEL[value] }));

// ── Calendar ─────────────────────────────────────────────────────────────────

// 0 = Sunday, matching the API.
export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ── Formatting ───────────────────────────────────────────────────────────────

export function formatSessionDuration(seconds: number): string {
  return formatDuration(Math.max(1, Math.round(seconds / 60)));
}

export function formatVolume(kg: number): string {
  return `${Math.round(kg).toLocaleString("en-IN")} kg`;
}

/** "00:07" / "12:34" / "1:02:09" for a running clock. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatRest(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m} min` : `${m}m ${s}s`;
}

/** A block of time reads as the time alone; sets of time or reps read as sets × dose. */
export function formatDose(measure: ExerciseMeasure, sets: number, reps: string): string {
  return measure === "minutes" ? reps : `${sets} × ${reps}`;
}

export function pluralize(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// ── Muscle work and session volume ────────────────────────────────────────────

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

/** Sets that count toward a session's "N sets" total — a timed cardio block is one block, not a set. */
export function countSets(items: HasVolume[]): number {
  return items.reduce((total, { exercise, sets }) => total + (exercise.measure !== "minutes" && Number.isFinite(sets) ? sets : 0), 0);
}
