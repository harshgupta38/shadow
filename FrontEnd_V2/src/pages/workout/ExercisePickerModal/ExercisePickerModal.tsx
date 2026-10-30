import { useEffect, useMemo, useState } from "react";
import { Modal } from "react-bootstrap";
import { CheckLg, InfoCircle } from "react-bootstrap-icons";

import type { ExerciseSummary } from "@/api";
import { IllustratedErrorState } from "@/components/ui/IllustratedErrorState/IllustratedErrorState";
import { ExerciseDetailModal } from "@/pages/workout/ExerciseDetailModal/ExerciseDetailModal";
import { ExerciseFilterBar } from "@/pages/workout/ExerciseFilterBar/ExerciseFilterBar";
import {
  EMPTY_EXERCISE_FILTERS,
  applyExerciseFilters,
  type ExerciseFilters,
} from "@/pages/workout/ExerciseFilterBar/exerciseFilters";
import { ExerciseThumb } from "@/pages/workout/ExerciseThumb/ExerciseThumb";
import { MuscleChips } from "@/pages/workout/MuscleMap/MuscleMap";
import { Skeleton } from "@/pages/workout/Skeleton/Skeleton";
import { EQUIPMENT_LABEL, pluralize } from "@/pages/workout/WorkoutPage.constants";
import { useExerciseLibrary } from "@/pages/workout/useExerciseLibrary";
import "./ExercisePickerModal.scss";

const PAGE = 30;

interface ExercisePickerModalProps {
  show: boolean;
  onClose: () => void;
  onPick: (exercises: ExerciseSummary[]) => void;
  /** Exercises already in the workout; they stay visible but can't be picked twice. */
  excludeIds?: number[];
  title?: string;
}

export function ExercisePickerModal({ show, onClose, onPick, excludeIds = [], title = "Add exercises" }: ExercisePickerModalProps) {
  const { exercises, loading, error, reload } = useExerciseLibrary();
  const [filters, setFilters] = useState<ExerciseFilters>(EMPTY_EXERCISE_FILTERS);
  const [selected, setSelected] = useState<number[]>([]);
  const [visible, setVisible] = useState(PAGE);
  const [previewId, setPreviewId] = useState<number | null>(null);

  // A fresh pick every time the dialog opens.
  useEffect(() => {
    if (show) {
      setSelected([]);
      setFilters(EMPTY_EXERCISE_FILTERS);
      setVisible(PAGE);
    }
  }, [show]);

  const results = useMemo(() => applyExerciseFilters(exercises, filters), [exercises, filters]);
  const taken = useMemo(() => new Set(excludeIds), [excludeIds]);

  const toggle = (id: number) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  function confirm() {
    const picked = selected.map((id) => exercises.find((e) => e.id === id)).filter((e): e is ExerciseSummary => Boolean(e));
    onPick(picked);
  }

  return (
    <>
      <Modal show={show} onHide={onClose} size="lg" centered scrollable dialogClassName="wk-pick-dialog" backdrop="static">
        <Modal.Header closeButton>
          <Modal.Title as="h2" className="wk-pick-title">{title}</Modal.Title>
        </Modal.Header>

        <Modal.Body>
          {error ? (
            <IllustratedErrorState onRetry={() => void reload()} />
          ) : (
            <>
              <ExerciseFilterBar
                filters={filters}
                onChange={(f) => { setFilters(f); setVisible(PAGE); }}
                resultLabel={loading ? undefined : pluralize(results.length, "exercise")}
              />

              {loading ? (
                <div className="wk-pick-list" aria-hidden="true">
                  {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} height={64} />)}
                </div>
              ) : results.length === 0 ? (
                <p className="wk-pick-empty">No exercises match. Try another muscle group or clear the filters.</p>
              ) : (
                <ul className="wk-pick-list">
                  {results.slice(0, visible).map((ex) => {
                    const isTaken = taken.has(ex.id);
                    const isPicked = selected.includes(ex.id);
                    return (
                      <li key={ex.id}>
                        <div className={`wk-pick-row${isPicked ? " is-picked" : ""}${isTaken ? " is-taken" : ""}`}>
                          <button
                            type="button"
                            className="wk-pick-main"
                            disabled={isTaken}
                            aria-pressed={isPicked}
                            onClick={() => toggle(ex.id)}
                          >
                            <span className="wk-pick-check" aria-hidden="true">{isPicked && <CheckLg size={13} />}</span>
                            <span className="wk-pick-thumb">
                              <ExerciseThumb exercise={ex} imageUrl={ex.image_url} mapSize="xs" />
                            </span>
                            <span className="wk-pick-info">
                              <span className="wk-pick-name">{ex.name}</span>
                              <MuscleChips primary={ex.primary_muscles} secondary={ex.secondary_muscles} max={3} />
                            </span>
                            <span className="wk-pick-meta">{isTaken ? "Added" : EQUIPMENT_LABEL[ex.equipment]}</span>
                          </button>
                          <button type="button" className="wk-pick-info-btn" aria-label={`Details for ${ex.name}`} onClick={() => setPreviewId(ex.id)}>
                            <InfoCircle size={16} />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {!loading && visible < results.length && (
                <div className="text-center">
                  <button type="button" className="btn btn-soft btn-sm px-4" onClick={() => setVisible((v) => v + PAGE)}>
                    Show more ({results.length - visible} left)
                  </button>
                </div>
              )}
            </>
          )}
        </Modal.Body>

        <Modal.Footer>
          <span className="wk-pick-count">{selected.length > 0 ? `${pluralize(selected.length, "exercise")} selected` : "Tap exercises to select them"}</span>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-brand" disabled={selected.length === 0} onClick={confirm}>
            {selected.length > 0 ? `Add ${selected.length}` : "Add"}
          </button>
        </Modal.Footer>
      </Modal>

      <ExerciseDetailModal exerciseId={previewId} onClose={() => setPreviewId(null)} />
    </>
  );
}
