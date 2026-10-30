import type {
  ExerciseKind,
  ExerciseMechanic,
  MuscleId,
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

// Coarse groups used for filtering and for the quick "train this" chips.
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

/** Cardio is counted in minutes, so its dose is the time alone. Lifts and drills read as sets × reps. */
export function formatDose(kind: ExerciseKind, sets: number, reps: string): string {
  return kind === "cardio" ? reps : `${sets} × ${reps}`;
}

export function pluralize(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
