import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "react-bootstrap";

import { api, ApiError } from "@/api";
import type { ExerciseDetail } from "@/api";
import { ExerciseDetailBody, ExerciseDetailSkeleton } from "@/pages/workout/ExerciseDetailBody/ExerciseDetailBody";
import "./ExerciseDetailModal.scss";

interface ExerciseDetailModalProps {
  /** The exercise to show; null keeps the modal closed. */
  exerciseId: number | null;
  onClose: () => void;
}

// The popup version of the exercise detail. Screens that can navigate away use the exercise page instead.
export function ExerciseDetailModal({ exerciseId, onClose }: ExerciseDetailModalProps) {
  const [detail, setDetail] = useState<ExerciseDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestRequest = useRef(0);

  const load = useCallback(async (id: number) => {
    const request = ++latestRequest.current;
    const isLatest = () => request === latestRequest.current;
    setLoading(true);
    setError(null);
    setDetail(null);
    try {
      const next = await api.workout.getExercise(id);
      if (isLatest()) setDetail(next);
    } catch (err) {
      if (isLatest()) setError(err instanceof ApiError ? err.message : "Could not load this exercise right now.");
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (exerciseId !== null) void load(exerciseId);
  }, [exerciseId, load]);

  // The last exercise stays in state after the popup closes, so it is shown only for the id being opened.
  const current = detail?.id === exerciseId ? detail : null;

  return (
    <Modal
      show={exerciseId !== null}
      onHide={onClose}
      size="xl"
      centered
      scrollable
      dialogClassName="wk-detail-dialog"
    >
      <Modal.Header closeButton>
        <Modal.Title as="h2" className="wk-detail-title">{current?.name ?? "Exercise"}</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {loading && <ExerciseDetailSkeleton />}

        {error && !loading && (
          <div className="wk-detail-error" role="alert">
            <p>{error}</p>
            {exerciseId !== null && (
              <button type="button" className="btn btn-soft" onClick={() => void load(exerciseId)}>Try again</button>
            )}
          </div>
        )}

        {current && !loading && <ExerciseDetailBody key={current.id} detail={current} />}
      </Modal.Body>
    </Modal>
  );
}
