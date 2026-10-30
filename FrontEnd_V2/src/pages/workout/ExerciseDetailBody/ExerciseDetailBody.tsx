import { useState } from "react";
import { ClockHistory, ExclamationTriangleFill, LightbulbFill } from "react-bootstrap-icons";

import type { ExerciseDetail, ExerciseSummary } from "@/api";
import { useDateFormat } from "@/context/PlannerContext";
import { formatDisplayDateShort } from "@/services/date.service";
import { ExerciseThumb } from "@/pages/workout/ExerciseThumb/ExerciseThumb";
import { MuscleChips, MuscleLegend, MuscleMap } from "@/pages/workout/MuscleMap/MuscleMap";
import { Skeleton } from "@/pages/workout/Skeleton/Skeleton";
import {
  EQUIPMENT_LABEL,
  KIND_LABEL,
  LEVEL_LABEL,
  LEVEL_PILL,
  MECHANIC_LABEL,
  formatRest,
} from "@/pages/workout/WorkoutPage.constants";
import "./ExerciseDetailBody.scss";

export function ExerciseDetailSkeleton() {
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

// Exercises linked to this one, as cards with their GIF. A page can open them; a popup shows them without links.
function RelatedExercises({
  exercises,
  onOpen,
}: {
  exercises: ExerciseSummary[];
  onOpen?: (exerciseId: number) => void;
}) {
  return (
    <ul className="wk-related">
      {exercises.map((item) => {
        const body = (
          <>
            <span className="wk-related-thumb">
              <ExerciseThumb exercise={item} imageUrl={item.image_url} mapSize="xs" />
            </span>
            <span className="wk-related-text">
              <strong>{item.name}</strong>
              <small>{KIND_LABEL[item.kind]}</small>
            </span>
          </>
        );
        return (
          <li key={item.id}>
            {onOpen ? (
              <button type="button" className="wk-related-card" onClick={() => onOpen(item.id)}>{body}</button>
            ) : (
              <div className="wk-related-card">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// The exercise itself: photos and animation, the muscles it trains, and how to do it. The popup and the
// exercise page both render this, so anything added here shows up in both.
export function ExerciseDetailBody({
  detail,
  onOpenExercise,
}: {
  detail: ExerciseDetail;
  onOpenExercise?: (exerciseId: number) => void;
}) {
  const dateFormat = useDateFormat();
  const [activeImage, setActiveImage] = useState(0);
  const images = detail.image_urls.length > 0 ? detail.image_urls : detail.image_url ? [detail.image_url] : [];
  const last = detail.last_performance ?? null;

  return (
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
          <MuscleMap size="lg" primary={detail.primary_muscles} secondary={detail.secondary_muscles} />
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
          {detail.measure === "minutes" ? (
            <div><strong>{detail.default_reps}</strong><span>time</span></div>
          ) : (
            <>
              <div><strong>{detail.default_sets}</strong><span>sets</span></div>
              <div><strong>{detail.default_reps}</strong><span>{detail.measure === "seconds" ? "per set" : "reps"}</span></div>
              <div><strong>{formatRest(detail.default_rest_seconds)}</strong><span>rest</span></div>
            </>
          )}
        </div>

        {last && (
          <div className="wk-detail-last">
            <ClockHistory size={16} aria-hidden="true" />
            <span>
              Last time ({formatDisplayDateShort(last.date, dateFormat)}):{" "}
              {detail.kind !== "strength" ? (
                <strong>done</strong>
              ) : detail.measure === "seconds" ? (
                <>
                  <strong>{last.seconds === null ? "–" : `${last.seconds} sec`}</strong>{" "}
                  best set, {last.sets} {last.sets === 1 ? "set" : "sets"} done
                </>
              ) : (
                <>
                  <strong>
                    {last.weight_kg !== null ? `${last.weight_kg} kg` : "bodyweight"}
                    {last.reps !== null ? ` × ${last.reps}` : ""}
                  </strong>{" "}
                  best set, {last.sets} {last.sets === 1 ? "set" : "sets"} done
                </>
              )}
            </span>
          </div>
        )}

        {detail.warm_up_with.length > 0 && (
          <section>
            <h3 className="wk-detail-h">Warm up with</h3>
            <RelatedExercises exercises={detail.warm_up_with} onOpen={onOpenExercise} />
          </section>
        )}

        {detail.good_warm_up_for.length > 0 && (
          <section>
            <h3 className="wk-detail-h">Good warm-up for</h3>
            <RelatedExercises exercises={detail.good_warm_up_for} onOpen={onOpenExercise} />
          </section>
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
  );
}
