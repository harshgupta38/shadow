import type { ExerciseEquipmentType, ExerciseKind, ExerciseSummary, MuscleId, WorkoutEquipment, WorkoutLevel } from "@/api";
import { MUSCLE_GROUPS, MUSCLE_LABEL } from "@/pages/workout/WorkoutPage.constants";

export interface ExerciseFilters {
  query: string;
  /** A MUSCLE_GROUPS id, or "all". */
  group: string;
  /** Muscles picked in the muscle picker (toggled on/off). Matches primary and secondary muscles. */
  muscles: MuscleId[];
  equipment: WorkoutEquipment[];
  /** How much gear to allow: none, light or heavy. Empty means any. */
  equipmentType: ExerciseEquipmentType[];
  level: WorkoutLevel[];
  /** Kinds to show. All three are on by default; with none on, nothing is shown. */
  kinds: ExerciseKind[];
}

const ALL_EXERCISE_KINDS: ExerciseKind[] = ["strength", "cardio", "warmup"];

export const DEFAULT_EXERCISE_FILTERS: ExerciseFilters = {
  query: "", group: "all", muscles: [], equipment: [], equipmentType: [], level: [], kinds: [...ALL_EXERCISE_KINDS],
};

export function hasActiveFilters(f: ExerciseFilters): boolean {
  return (
    f.query.trim() !== "" ||
    f.group !== "all" ||
    f.muscles.length > 0 ||
    f.equipment.length > 0 ||
    f.equipmentType.length > 0 ||
    f.level.length > 0 ||
    ALL_EXERCISE_KINDS.some((kind) => !f.kinds.includes(kind))
  );
}

// Each word must match, as typed or as its singular, and hyphens are ignored: "leg raises" finds "Leg Raise",
// "pullups" finds "Pull-Up" and "crunches" finds "Crunch".
function matchesWord(haystack: string, word: string): boolean {
  if (haystack.includes(word)) return true;
  if (word.length <= 3) return false;
  return (word.endsWith("es") && haystack.includes(word.slice(0, -2))) ||
    (word.endsWith("s") && haystack.includes(word.slice(0, -1)));
}

export function applyExerciseFilters(list: ExerciseSummary[], f: ExerciseFilters): ExerciseSummary[] {
  const query = f.query.trim().toLowerCase().replace(/-/g, "");
  const words = query.split(/\s+/).filter(Boolean);
  const joined = query.replace(/\s/g, "");
  const groupMuscles = f.group === "all" ? null : (MUSCLE_GROUPS.find((g) => g.id === f.group)?.muscles ?? []);
  const muscles = f.muscles;

  return list
    .filter((ex) => {
      if (groupMuscles && !ex.primary_muscles.some((m) => groupMuscles.includes(m))) return false;
      if (muscles.length > 0 && !ex.primary_muscles.some((m) => muscles.includes(m)) && !ex.secondary_muscles.some((m) => muscles.includes(m))) return false;
      if (f.equipment.length > 0 && !f.equipment.includes(ex.equipment)) return false;
      if (f.equipmentType.length > 0 && !f.equipmentType.includes(ex.equipment_type)) return false;
      if (f.level.length > 0 && !f.level.includes(ex.level)) return false;
      if (!f.kinds.includes(ex.kind)) return false;
      if (words.length > 0) {
        const haystack = [ex.name, ...ex.primary_muscles.map((m) => MUSCLE_LABEL[m])]
          .join(" ").toLowerCase().replace(/-/g, "");
        // The whole query with its spaces removed counts too, so "push ups" finds "Push-Up".
        const matched = words.every((word) => matchesWord(haystack, word)) ||
          matchesWord(haystack.replace(/\s/g, ""), joined);
        if (!matched) return false;
      }
      return true;
    })
    .sort((a, b) => {
      // With muscles picked, the exercises that train any of them directly come before the ones that only support them.
      if (muscles.length > 0) {
        const trainsDirectly = (ex: ExerciseSummary) => ex.primary_muscles.some((m) => muscles.includes(m));
        const byRole = Number(!trainsDirectly(a)) - Number(!trainsDirectly(b));
        if (byRole !== 0) return byRole;
      }
      return a.name.localeCompare(b.name);
    });
}
