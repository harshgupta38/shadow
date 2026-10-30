import { useCallback, useEffect, useState } from "react";
import { Modal } from "react-bootstrap";
import { ClockHistory, ExclamationTriangleFill, LightbulbFill, PlusLg } from "react-bootstrap-icons";

import { api, ApiError } from "@/api";
import type { ExerciseDetail } from "@/api";
import { formatDisplayDateShort } from "@/services/date.service";
import { useDateFormat } from "@/context/PlannerContext";
import { ExerciseThumb } from "@/pages/workout/ExerciseThumb/ExerciseThumb";
import { Skeleton } from "@/pages/workout/Skeleton/Skeleton";
import { MuscleChips, MuscleLegend, MuscleMap } from "@/pages/workout/MuscleMap/MuscleMap";
import {
  EQUIPMENT_LABEL,
  LEVEL_LABEL,
  LEVEL_PILL,
  MECHANIC_LABEL,
  formatRest,
} from "@/pages/workout/WorkoutPage.constants";
import "./ExerciseDetailModal.scss";

interface ExerciseDetailModalProps {
  /** The exercise to show; null keeps the modal closed. */
  exerciseId: number | null;
  onClose: () => void;
  /** When given, the footer offers an add button (used while building a plan or a workout). */
  onAdd?: (exercise: ExerciseDetail) => void;
  addLabel?: string;
}

function DetailSkeleton() {
  return (
    <div className="wk-detail-grid" aria-hidden="true">
      <div className="wk-detail-col">
        <Skeleton height={300} />
      </div>
      <div className="wk-detail-col">
        <Skeleton height={22} width="55%" />
        <Skeleton height={64} />
        <Skeleton height={150} />
      </div>
    </div>
  );
}

export function ExerciseDetailModal({ exerciseId, onClose, onAdd, addLabel = "Add to workout" }: ExerciseDetailModalProps) {
  const dateFormat = useDateFormat();
  const [detail, setDetail] = useState<ExerciseDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState(0);

  const load = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    setDetail(null);
    setActiveImage(0);
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

  const images = detail ? (detail.image_urls.length > 0 ? detail.image_urls : detail.image_url ? [detail.image_url] : []) : [];
  const last = detail?.last_performance ?? null;

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
        {loading && <DetailSkeleton />}

        {error && !loading && (
          <div className="wk-detail-error" role="alert">
            <p>{error}</p>
            {exerciseId !== null && (
              <button type="button" className="btn btn-soft" onClick={() => void load(exerciseId)}>Try again</button>
            )}
          </div>
        )}

        {detail && !loading && (
          <div className="wk-detail-grid">
            {/* Left: what it looks like and which muscles it trains */}
            <div className="wk-detail-col">
              {images.length > 0 && (
                <div className="wk-detail-media">
                  <div className="wk-detail-hero">
                    <ExerciseThumb exercise={detail} imageUrl={images[activeImage] ?? null} />
                  </div>
                  {images.length > 1 && (
                    <div className="wk-detail-thumbs" role="tablist" aria-label="Exercise images">
                      {images.map((src, i) => (
                        <button
                          key={src}
                          type="button"
                          role="tab"
                          aria-selected={i === activeImage}
                          aria-label={`Image ${i + 1} of ${images.length}`}
                          className={`wk-detail-thumb${i === activeImage ? " is-active" : ""}`}
                          onClick={() => setActiveImage(i)}
                        >
                          <img src={src} alt="" loading="lazy" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <section className="wk-detail-card">
                <header className="wk-detail-card-head">
                  <h3 className="wk-detail-h">Muscles worked</h3>
                  <MuscleLegend />
                </header>
                <MuscleMap
                  size="lg"
                  primary={detail.primary_muscles}
                  secondary={detail.secondary_muscles}
                />
                <dl className="wk-detail-muscles">
                  <div>
                    <dt>Primary</dt>
                    <dd><MuscleChips primary={detail.primary_muscles} /></dd>
                  </div>
                  {detail.secondary_muscles.length > 0 && (
                    <div>
                      <dt>Secondary</dt>
                      <dd><MuscleChips primary={[]} secondary={detail.secondary_muscles} /></dd>
                    </div>
                  )}
                </dl>
              </section>
            </div>

            {/* Right: how to do it */}
            <div className="wk-detail-col">
              <div className="wk-detail-badges">
                <span className={`pill ${LEVEL_PILL[detail.level]}`}>{LEVEL_LABEL[detail.level]}</span>
                <span className="pill">{EQUIPMENT_LABEL[detail.equipment]}</span>
                <span className="pill">{MECHANIC_LABEL[detail.mechanic]}</span>
              </div>

              {detail.description && <p className="wk-detail-desc">{detail.description}</p>}

              <div className="wk-detail-targets" aria-label="Recommended volume">
                <div><strong>{detail.default_sets}</strong><span>sets</span></div>
                <div><strong>{detail.default_reps}</strong><span>reps</span></div>
                <div><strong>{formatRest(detail.default_rest_seconds)}</strong><span>rest</span></div>
              </div>

              {last && (
                <div className="wk-detail-last">
                  <ClockHistory size={16} aria-hidden="true" />
                  <span>
                    Last time ({formatDisplayDateShort(last.date, dateFormat)}):{" "}
                    <strong>
                      {last.weight_kg !== null ? `${last.weight_kg} kg` : "bodyweight"}
                      {last.reps !== null ? ` × ${last.reps}` : ""}
                    </strong>{" "}
                    best set, {last.sets} {last.sets === 1 ? "set" : "sets"} done
                  </span>
                </div>
              )}

              {detail.instructions.length > 0 && (
                <section>
                  <h3 className="wk-detail-h">How to do it</h3>
                  <ol className="wk-steps">
                    {detail.instructions.map((step, i) => (
                      <li key={i}>
                        <span className="wk-step-num">{i + 1}</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              {detail.tips.length > 0 && (
                <section>
                  <h3 className="wk-detail-h">Pro tips</h3>
                  <ul className="wk-notes wk-notes--tip">
                    {detail.tips.map((t, i) => (
                      <li key={i}><LightbulbFill size={13} aria-hidden="true" /><span>{t}</span></li>
                    ))}
                  </ul>
                </section>
              )}

              {detail.common_mistakes.length > 0 && (
                <section>
                  <h3 className="wk-detail-h">Common mistakes</h3>
                  <ul className="wk-notes wk-notes--warn">
                    {detail.common_mistakes.map((t, i) => (
                      <li key={i}><ExclamationTriangleFill size={13} aria-hidden="true" /><span>{t}</span></li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </div>
        )}
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
