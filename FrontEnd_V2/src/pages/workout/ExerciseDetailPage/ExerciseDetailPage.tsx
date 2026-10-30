import { useCallback, useEffect, useState } from "react";
import { HeartPulseFill } from "react-bootstrap-icons";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { api, ApiError } from "@/api";
import type { ExerciseDetail } from "@/api";
import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import { ExerciseDetailBody, ExerciseDetailSkeleton } from "@/pages/workout/ExerciseDetailBody/ExerciseDetailBody";
import { ROUTES } from "@/routes/RoutePaths";
import "./ExerciseDetailPage.scss";

// One exercise on its own page, so there is room for more detail than a popup can hold.
export function ExerciseDetailPage() {
  const { exerciseId } = useParams<{ exerciseId: string }>();
  const id = Number(exerciseId);
  const navigate = useNavigate();
  const location = useLocation();
  const [detail, setDetail] = useState<ExerciseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDetail(null);
    try {
      setDetail(await api.workout.getExercise(id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this exercise right now.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Back goes to wherever the user came from. A page opened straight from a link has no history, so it goes to the library.
  const goBack = () => (location.key === "default" ? navigate(`${ROUTES.WORKOUT}?tab=exercises`) : navigate(-1));
  const openExercise = (exerciseId: number) =>
    navigate(ROUTES.WORKOUT_EXERCISE.replace(":exerciseId", String(exerciseId)));

  return (
    <div className="wk-detail-page">
      <PageHeader title={detail?.name ?? "Exercise"} icon={<HeartPulseFill />} onBack={goBack} />

      {loading && <ExerciseDetailSkeleton />}

      {error && !loading && (
        <div className="wk-detail-error" role="alert">
          <p>{error}</p>
          <button type="button" className="btn btn-soft" onClick={() => void load()}>Try again</button>
        </div>
      )}

      {detail && !loading && <ExerciseDetailBody key={detail.id} detail={detail} onOpenExercise={openExercise} />}
    </div>
  );
}
