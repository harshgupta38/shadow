import { useCallback } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { GripVertical } from "react-bootstrap-icons";

import type { DraftDay } from "@/pages/workout/PlanBuilderPage/builderState";
import { pluralize } from "@/pages/workout/WorkoutPage.constants";

interface WeekdayTabProps {
  weekday: number;
  label: string;
  longLabel: string;
  day: DraftDay | null;
  selected: boolean;
  onSelect: () => void;
}

/** One tile in the weekly schedule strip — a rest slot or a training day, draggable onto any other slot to reschedule it. */
export function WeekdayTab({ weekday, label, longLabel, day, selected, onSelect }: WeekdayTabProps) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: weekday,
    disabled: !day,
    attributes: { role: "tab", roleDescription: "weekday" },
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: weekday });

  const setRef = useCallback((node: HTMLButtonElement | null) => {
    setDragRef(node);
    setDropRef(node);
  }, [setDragRef, setDropRef]);

  // A rest slot can't be dragged, but it's still fully clickable (tap it to select it, or to "Train on" it) —
  // dnd-kit's aria-disabled describes only the drag capability, so it must not land on the button itself.
  const { "aria-disabled": _dragDisabled, ...dragAttributes } = attributes;

  return (
    <button
      ref={setRef}
      type="button"
      {...dragAttributes}
      {...listeners}
      role="tab"
      aria-selected={selected}
      className={`wk-bw-day${selected ? " is-selected" : ""}${day ? " is-on" : ""}${isDragging ? " is-dragging" : ""}${isOver ? " is-drop-target" : ""}`}
      onClick={onSelect}
      title={day ? `${longLabel} — press and drag to move this day to another weekday` : longLabel}
    >
      {day && <GripVertical size={10} className="wk-bw-grip" aria-hidden="true" />}
      <span className="wk-bw-label">{label}</span>
      <span className="wk-bw-name">{day ? day.name : "Rest"}</span>
      {day && <span className="wk-bw-count">{pluralize(day.exercises.length, "exercise")}</span>}
    </button>
  );
}
