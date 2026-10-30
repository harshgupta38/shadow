import { useEffect, useState } from "react";

import type { ExerciseSummary } from "@/api/types";
import { MuscleMap, type MuscleView } from "@/pages/workout/MuscleMap/MuscleMap";
import "./ExerciseThumb.scss";

type ThumbSource = Pick<ExerciseSummary, "name" | "primary_muscles" | "secondary_muscles">;

interface ExerciseThumbProps {
  exercise: ThumbSource;
  /** Photo to show. When missing or broken, the muscle diagram is drawn instead. */
  imageUrl: string | null;
  /** Size of the fallback diagram; the thumb itself fills whatever box its parent gives it. */
  mapSize?: "xs" | "sm" | "md";
  /** Which side(s) of the body the fallback diagram shows. */
  view?: MuscleView;
  className?: string;
}

// Fills its parent. A photo when there is one, otherwise the body diagram of the muscles trained,
// so every exercise always has something meaningful to look at.
export function ExerciseThumb({ exercise, imageUrl, mapSize = "sm", view = "auto", className }: ExerciseThumbProps) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [imageUrl]);

  const showPhoto = Boolean(imageUrl) && !failed;
  return (
    <div className={`wk-thumb${showPhoto ? "" : " wk-thumb--map"}${className ? ` ${className}` : ""}`}>
      {showPhoto ? (
        <img src={imageUrl as string} alt={exercise.name} loading="lazy" decoding="async" onError={() => setFailed(true)} />
      ) : (
        <MuscleMap
          view={view}
          size={mapSize}
          primary={exercise.primary_muscles}
          secondary={exercise.secondary_muscles}
        />
      )}
    </div>
  );
}
