import type { MouseEvent } from "react";
import { Link } from "react-router-dom";

import type { ExerciseSummary } from "@/api/types";
import { ExerciseThumb } from "@/pages/workout/ExerciseThumb/ExerciseThumb";
import { MuscleChips } from "@/pages/workout/MuscleMap/MuscleMap";
import { EQUIPMENT_LABEL, LEVEL_LABEL, LEVEL_PILL } from "@/pages/workout/WorkoutPage.constants";
import { ROUTES } from "@/routes/RoutePaths";
import "./ExerciseCard.scss";

interface ExerciseCardProps {
  exercise: ExerciseSummary;
  onOpen: (exercise: ExerciseSummary) => void;
}

export function ExerciseCard({ exercise, onOpen }: ExerciseCardProps) {
  // A real link, so the browser can open it in a new tab (middle click, Ctrl or Shift click, "Open in new tab").
  // A plain left click still goes through onOpen, which opens it in this tab.
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onOpen(exercise);
  };

  return (
    <Link
      to={ROUTES.WORKOUT_EXERCISE.replace(":exerciseId", String(exercise.id))}
      className="wk-ex-card surface"
      onClick={handleClick}
    >
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
    </Link>
  );
}
