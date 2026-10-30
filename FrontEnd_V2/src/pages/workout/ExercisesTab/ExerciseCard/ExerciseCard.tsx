import type { ExerciseSummary } from "@/api/types";
import { ExerciseThumb } from "@/pages/workout/ExerciseThumb/ExerciseThumb";
import { MuscleChips } from "@/pages/workout/MuscleMap/MuscleMap";
import { EQUIPMENT_LABEL, LEVEL_LABEL, LEVEL_PILL } from "@/pages/workout/WorkoutPage.constants";
import "./ExerciseCard.scss";

interface ExerciseCardProps {
  exercise: ExerciseSummary;
  onOpen: (exercise: ExerciseSummary) => void;
}

export function ExerciseCard({ exercise, onOpen }: ExerciseCardProps) {
  return (
    <button type="button" className="wk-ex-card surface" onClick={() => onOpen(exercise)}>
      <div className="wk-ex-card-media">
        <ExerciseThumb exercise={exercise} imageUrl={exercise.image_url} mapSize="md" />
      </div>
      <div className="wk-ex-card-body">
        <span className="wk-ex-card-name">{exercise.name}</span>
        <MuscleChips primary={exercise.primary_muscles} secondary={exercise.secondary_muscles} max={3} />
        <div className="wk-ex-card-meta">
          <span className="pill">{EQUIPMENT_LABEL[exercise.equipment]}</span>
          <span className={`pill ${LEVEL_PILL[exercise.level]}`}>{LEVEL_LABEL[exercise.level]}</span>
        </div>
      </div>
    </button>
  );
}
