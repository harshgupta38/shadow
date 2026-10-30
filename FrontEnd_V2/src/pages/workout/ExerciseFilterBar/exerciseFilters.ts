import type { ExerciseSummary, MuscleId, WorkoutEquipment, WorkoutLevel } from "@/api";
import { MUSCLE_GROUPS, MUSCLE_LABEL } from "@/pages/workout/WorkoutPage.constants";

export interface ExerciseFilters {
  query: string;
  /** A MUSCLE_GROUPS id, or "all". */
  group: string;
  /** One muscle picked in the muscle picker. Matches primary and secondary muscles. */
  muscle: MuscleId | null;
  equipment: WorkoutEquipment[];
  level: WorkoutLevel[];
}

export const EMPTY_EXERCISE_FILTERS: ExerciseFilters = { query: "", group: "all", muscle: null, equipment: [], level: [] };

export function hasActiveFilters(f: ExerciseFilters): boolean {
  return f.query.trim() !== "" || f.group !== "all" || f.muscle !== null || f.equipment.length > 0 || f.level.length > 0;
}

export function applyExerciseFilters(list: ExerciseSummary[], f: ExerciseFilters): ExerciseSummary[] {
  const query = f.query.trim().toLowerCase();
  const groupMuscles = f.group === "all" ? null : (MUSCLE_GROUPS.find((g) => g.id === f.group)?.muscles ?? []);
  const muscle = f.muscle;

  return list
    .filter((ex) => {
      if (groupMuscles && !ex.primary_muscles.some((m) => groupMuscles.includes(m))) return false;
      if (muscle && !ex.primary_muscles.includes(muscle) && !ex.secondary_muscles.includes(muscle)) return false;
      if (f.equipment.length > 0 && !f.equipment.includes(ex.equipment)) return false;
      if (f.level.length > 0 && !f.level.includes(ex.level)) return false;
      if (query) {
        const haystack = [ex.name, ...ex.primary_muscles.map((m) => MUSCLE_LABEL[m])].join(" ").toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      // With a muscle picked, the exercises that train it directly come before the ones that only support it.
      if (muscle) {
        const byRole = Number(!a.primary_muscles.includes(muscle)) - Number(!b.primary_muscles.includes(muscle));
        if (byRole !== 0) return byRole;
      }
      return a.name.localeCompare(b.name);
    });
}
