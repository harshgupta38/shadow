import { useState } from "react";
import { KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";

import type { ExerciseSummary } from "@/api/types";
import {
  newDraftDay,
  newDraftExercise,
  type DraftDay,
  type DraftExercise,
  type PlanDraft,
} from "@/pages/workout/PlanBuilderPage/PlanBuilderPage.constants";

/**
 * A plan being edited: the draft, the weekday open for editing, and every way to change them.
 * Shared by the plan builder page and the review panel for plans the Workout Coach drafts.
 */
export function usePlanDraft(initial: PlanDraft) {
  const [draft, setDraft] = useState<PlanDraft>(initial);
  const [weekday, setWeekday] = useState<number | null>(() => initial.days[0]?.weekday ?? null);

  /** The open weekday's session, or null on a rest day. */
  const day = draft.days.find((d) => d.weekday === weekday) ?? null;

  const patchDraft = (patch: Partial<PlanDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const patchDay = (target: number, fn: (d: DraftDay) => DraftDay) =>
    setDraft((d) => ({ ...d, days: d.days.map((x) => (x.weekday === target ? fn(x) : x)) }));

  function addDay(target: number) {
    setDraft((d) => ({ ...d, days: [...d.days, newDraftDay(target)].sort((a, b) => a.weekday - b.weekday) }));
    setWeekday(target);
  }

  /** Makes a weekday a rest day. If it was the open one, another training day opens. */
  function removeDay(target: number) {
    setDraft((d) => ({ ...d, days: d.days.filter((x) => x.weekday !== target) }));
    setWeekday((current) => (current === target ? (draft.days.find((x) => x.weekday !== target)?.weekday ?? null) : current));
  }

  function addExercises(picked: ExerciseSummary[]) {
    if (weekday === null) return;
    patchDay(weekday, (d) => ({ ...d, exercises: [...d.exercises, ...picked.map(newDraftExercise)] }));
  }

  const changeExercise = (key: string, patch: Partial<DraftExercise>) =>
    weekday !== null && patchDay(weekday, (d) => ({ ...d, exercises: d.exercises.map((e) => (e.key === key ? { ...e, ...patch } : e)) }));

  const removeExercise = (key: string) =>
    weekday !== null && patchDay(weekday, (d) => ({ ...d, exercises: d.exercises.filter((e) => e.key !== key) }));

  // Reordering the open day's exercises by dragging, or with the keyboard (space, arrow keys, space).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id || weekday === null) return;
    patchDay(weekday, (d) => {
      const from = d.exercises.findIndex((e) => e.key === active.id);
      const to = d.exercises.findIndex((e) => e.key === over.id);
      return from < 0 || to < 0 ? d : { ...d, exercises: arrayMove(d.exercises, from, to) };
    });
  }

  return {
    draft,
    setDraft,
    weekday,
    setWeekday,
    day,
    patchDraft,
    patchDay,
    addDay,
    removeDay,
    addExercises,
    changeExercise,
    removeExercise,
    sensors,
    onDragEnd,
  };
}
