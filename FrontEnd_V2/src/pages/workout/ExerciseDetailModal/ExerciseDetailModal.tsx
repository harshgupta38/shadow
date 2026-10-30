import { useCallback, useEffect, useState } from "react";
import { Modal } from "react-bootstrap";
import { PlusLg } from "react-bootstrap-icons";

import { api, ApiError } from "@/api";
import type { ExerciseDetail } from "@/api";
import { ExerciseDetailBody, ExerciseDetailSkeleton } from "@/pages/workout/ExerciseDetailBody/ExerciseDetailBody";
import "./ExerciseDetailModal.scss";

interface ExerciseDetailModalProps {
  /** The exercise to show; null keeps the modal closed. */
  exerciseId: number | null;
  onClose: () => void;
  /** When given, the footer offers an add button (used while building a plan or a workout). */
  onAdd?: (exercise: ExerciseDetail) => void;
  addLabel?: string;
}

// The popup version of the exercise detail. Screens that can navigate away use the exercise page instead.
export function ExerciseDetailModal({ exerciseId, onClose, onAdd, addLabel = "Add to workout" }: ExerciseDetailModalProps) {
  const [detail, setDetail] = useState<ExerciseDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (id: number) => {
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
  }, []);

  useEffect(() => {
    if (exerciseId !== null) void load(exerciseId);
  }, [exerciseId, load]);

  return (
    <Modal
      show={exerciseId !== null}
      onHide={onClose}
      size="xl"
      centered
      scrollable
      dialogClassName="wk-detail-dialog"
      contentClassName="wk-detail-content"
    >
      <Modal.Header closeButton>
        <Modal.Title as="h2" className="wk-detail-title">{detail?.name ?? "Exercise"}</Modal.Title>
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

        {detail && !loading && <ExerciseDetailBody key={detail.id} detail={detail} />}
      </Modal.Body>

      {onAdd && detail && !loading && (
        <Modal.Footer>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Close</button>
          <button type="button" className="btn btn-brand d-inline-flex align-items-center gap-2" onClick={() => onAdd(detail)}>
            <PlusLg size={14} /> {addLabel}
          </button>
        </Modal.Footer>
      )}
    </Modal>
  );
}
