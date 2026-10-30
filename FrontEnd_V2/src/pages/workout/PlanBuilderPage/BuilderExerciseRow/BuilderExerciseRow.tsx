import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash3 } from "react-bootstrap-icons";

import { ExerciseThumb } from "@/pages/workout/ExerciseThumb/ExerciseThumb";
import { MuscleChips } from "@/pages/workout/MuscleMap/MuscleMap";
import { MAX_CARDIO_MINUTES, MAX_SETS, REST_OPTIONS, minutesOf, type DraftExercise } from "@/pages/workout/PlanBuilderPage/builderState";
import { formatRest } from "@/pages/workout/WorkoutPage.constants";
import "./BuilderExerciseRow.scss";

interface BuilderExerciseRowProps {
  item: DraftExercise;
  index: number;
  onChange: (patch: Partial<DraftExercise>) => void;
  onRemove: () => void;
  onOpen: () => void;
}

export function BuilderExerciseRow({ item, index, onChange, onRemove, onOpen }: BuilderExerciseRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.key });

  const restOptions = REST_OPTIONS.includes(item.rest_seconds) ? REST_OPTIONS : [...REST_OPTIONS, item.rest_seconds].sort((a, b) => a - b);

  return (
    <li
      ref={setNodeRef}
      className={`wk-brow${isDragging ? " is-dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        type="button"
        className="wk-brow-grip"
        aria-label={`Reorder ${item.exercise.name}. Use space, then arrow keys.`}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} />
      </button>

      <span className="wk-brow-num" aria-hidden="true">{index + 1}</span>

      <button type="button" className="wk-brow-id" onClick={onOpen} aria-label={`Details for ${item.exercise.name}`}>
        <span className="wk-brow-thumb">
          <ExerciseThumb exercise={item.exercise} imageUrl={item.exercise.image_url} mapSize="xs" />
        </span>
        <span className="wk-brow-name">
          <strong>{item.exercise.name}</strong>
          <MuscleChips primary={item.exercise.primary_muscles} max={2} />
        </span>
      </button>

      {item.exercise.kind === "cardio" ? (
        <div className="wk-brow-fields is-single">
          <label>
            <span>Minutes</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_CARDIO_MINUTES}
              step={1}
              value={minutesOf(item.reps) ?? ""}
              onChange={(e) => onChange({ reps: e.target.value === "" ? "" : `${Math.round(Number(e.target.value))} min` })}
            />
          </label>
        </div>
      ) : (
        <div className="wk-brow-fields">
          <label>
            <span>Sets</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_SETS}
              value={item.sets}
              onChange={(e) => onChange({ sets: Number(e.target.value) })}
            />
          </label>
          <label>
            <span>Reps</span>
            <input
              type="text"
              maxLength={12}
              placeholder="8-12"
              value={item.reps}
              onChange={(e) => onChange({ reps: e.target.value })}
            />
          </label>
          <label>
            <span>Rest</span>
            <select value={item.rest_seconds} onChange={(e) => onChange({ rest_seconds: Number(e.target.value) })}>
              {restOptions.map((s) => <option key={s} value={s}>{formatRest(s)}</option>)}
            </select>
          </label>
          <label>
            <span>kg <em>(optional)</em></span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={0.5}
              placeholder="–"
              value={item.weight_kg ?? ""}
              onChange={(e) => onChange({ weight_kg: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })}
            />
          </label>
        </div>
      )}

      <button type="button" className="wk-brow-remove" aria-label={`Remove ${item.exercise.name}`} onClick={onRemove}>
        <Trash3 size={15} />
      </button>
    </li>
  );
}
