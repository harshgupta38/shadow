import { useEffect, useMemo, useRef, useState } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CheckLg, ExclamationTriangleFill, HeartPulseFill, PlusLg, Trash3 } from "react-bootstrap-icons";
import { useNavigate, useParams } from "react-router-dom";

import { api, ApiError } from "@/api";
import type { ExerciseSummary, MuscleId } from "@/api";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { IllustratedErrorState } from "@/components/ui/IllustratedErrorState/IllustratedErrorState";
import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import { useToast } from "@/context/ToastContext";
import { ROUTES } from "@/routes/RoutePaths";
import { ExerciseDetailModal } from "@/pages/workout/ExerciseDetailModal/ExerciseDetailModal";
import { ExercisePickerModal } from "@/pages/workout/ExercisePickerModal/ExercisePickerModal";
import { MuscleBars } from "@/pages/workout/MuscleBars/MuscleBars";
import { MuscleLegend, MuscleMap } from "@/pages/workout/MuscleMap/MuscleMap";
import { BuilderExerciseRow } from "@/pages/workout/PlanBuilderPage/BuilderExerciseRow/BuilderExerciseRow";
import {
  EMPTY_DRAFT,
  MAX_DESCRIPTION,
  MAX_NAME,
  draftFromPlan,
  newDraftDay,
  newDraftExercise,
  snapshot,
  toSaveRequest,
  validateDraft,
  type DraftDay,
  type DraftExercise,
  type PlanDraft,
} from "@/pages/workout/PlanBuilderPage/builderState";
import { Skeleton } from "@/pages/workout/Skeleton/Skeleton";
import {
  GOAL_OPTIONS,
  LEVEL_OPTIONS,
  MUSCLE_LABEL,
  WEEKDAY_LONG,
  WEEKDAY_SHORT,
  formatSessionDuration,
  pluralize,
} from "@/pages/workout/WorkoutPage.constants";
import { estimateMinutes, musclesOf, setsByMuscle } from "@/pages/workout/workoutMath";
import "./PlanBuilderPage.scss";

const ALL_MUSCLES = Object.keys(MUSCLE_LABEL) as MuscleId[];

export function PlanBuilderPage() {
  const { planId } = useParams();
  const editingId = planId ? Number(planId) : null;
  const isEdit = editingId !== null;
  const navigate = useNavigate();
  const toast = useToast();

  const [draft, setDraft] = useState<PlanDraft>(EMPTY_DRAFT);
  const [initial, setInitial] = useState(() => snapshot(EMPTY_DRAFT));
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [weekday, setWeekday] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<"leave" | "remove-day" | null>(null);
  const errorsRef = useRef<HTMLDivElement>(null);

  // ── Load (edit mode) ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isEdit) return;
    if (!Number.isInteger(editingId) || (editingId as number) <= 0) {
      setLoadError("This plan doesn't exist.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    api.workout
      .getPlan(editingId as number)
      .then((plan) => {
        if (cancelled) return;
        const next = draftFromPlan(plan);
        setDraft(next);
        setInitial(snapshot(next));
        setWeekday(next.days[0]?.weekday ?? null);
      })
      .catch((err) => !cancelled && setLoadError(err instanceof ApiError ? err.message : "Could not load this plan right now."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [editingId, isEdit]);

  const dirty = useMemo(() => snapshot(draft) !== initial, [draft, initial]);

  // Closing the tab with unsaved work asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // ── Draft editing ──────────────────────────────────────────────────────────
  const day = draft.days.find((d) => d.weekday === weekday) ?? null;

  const patchDraft = (patch: Partial<PlanDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const patchDay = (target: number, fn: (d: DraftDay) => DraftDay) =>
    setDraft((d) => ({ ...d, days: d.days.map((x) => (x.weekday === target ? fn(x) : x)) }));

  function addDay(target: number) {
    setDraft((d) => ({ ...d, days: [...d.days, newDraftDay(target)].sort((a, b) => a.weekday - b.weekday) }));
    setWeekday(target);
  }

  function removeDay(target: number) {
    setDraft((d) => ({ ...d, days: d.days.filter((x) => x.weekday !== target) }));
    setWeekday((current) => (current === target ? (draft.days.find((x) => x.weekday !== target)?.weekday ?? null) : current));
    setConfirm(null);
  }

  function requestRemoveDay() {
    if (!day) return;
    if (day.exercises.length > 0) setConfirm("remove-day");
    else removeDay(day.weekday);
  }

  function addExercises(picked: ExerciseSummary[]) {
    if (weekday === null) return;
    patchDay(weekday, (d) => ({ ...d, exercises: [...d.exercises, ...picked.map(newDraftExercise)] }));
    setPickerOpen(false);
  }

  const changeExercise = (key: string, patch: Partial<DraftExercise>) =>
    weekday !== null && patchDay(weekday, (d) => ({ ...d, exercises: d.exercises.map((e) => (e.key === key ? { ...e, ...patch } : e)) }));

  const removeExercise = (key: string) =>
    weekday !== null && patchDay(weekday, (d) => ({ ...d, exercises: d.exercises.filter((e) => e.key !== key) }));

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

  // ── Derived ────────────────────────────────────────────────────────────────
  const dayMuscles = useMemo(() => musclesOf(day?.exercises ?? []), [day]);
  const dayMinutes = useMemo(() => estimateMinutes(day?.exercises ?? []), [day]);
  const daySets = day?.exercises.reduce((t, e) => t + (e.exercise.kind !== "cardio" && Number.isFinite(e.sets) ? e.sets : 0), 0) ?? 0;
  const weekVolume = useMemo(() => setsByMuscle(draft.days.flatMap((d) => d.exercises)), [draft.days]);
  const untrained = useMemo(() => {
    const trained = new Set(weekVolume.map((v) => v.muscle));
    return ALL_MUSCLES.filter((m) => !trained.has(m));
  }, [weekVolume]);

  const problems = useMemo(() => validateDraft(draft), [draft]);

  // ── Save / leave ───────────────────────────────────────────────────────────
  async function save() {
    if (problems.length > 0) {
      setShowErrors(true);
      errorsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSaving(true);
    try {
      const request = toSaveRequest(draft);
      const saved = isEdit ? await api.workout.updatePlan(editingId as number, request) : await api.workout.createPlan(request);
      setInitial(snapshot(draft)); // nothing unsaved any more, so leaving won't prompt
      toast.success(isEdit ? "Plan updated." : "Plan created. Nice work.");
      navigate(ROUTES.WORKOUT_PLAN_DETAIL.replace(":planId", String(saved.id)), { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save the plan. Please try again.");
      setSaving(false);
    }
  }

  const goBack = () => navigate(isEdit ? ROUTES.WORKOUT_PLAN_DETAIL.replace(":planId", String(editingId)) : `${ROUTES.WORKOUT}?tab=plans`);
  const requestBack = () => (dirty ? setConfirm("leave") : goBack());

  // ── Render ─────────────────────────────────────────────────────────────────
  const title = isEdit ? "Edit plan" : "New plan";

  if (loadError) {
    return (
      <div className="wk-builder">
        <PageHeader title={title} icon={<HeartPulseFill />} onBack={() => navigate(`${ROUTES.WORKOUT}?tab=plans`)} />
        <IllustratedErrorState onRetry={() => window.location.reload()} />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="wk-builder" aria-hidden="true">
        <PageHeader title={title} icon={<HeartPulseFill />} onBack={() => navigate(`${ROUTES.WORKOUT}?tab=plans`)} />
        <Skeleton height={170} />
        <Skeleton height={380} />
      </div>
    );
  }

  const nameTooLong = draft.name.length > MAX_NAME;

  return (
    <div className="wk-builder">
      <PageHeader
        title={title}
        subtitle="Choose your training days, then add the exercises for each one."
        icon={<HeartPulseFill />}
        onBack={requestBack}
        actions={[
          {
            key: "save",
            label: saving ? "Saving…" : isEdit ? "Save changes" : "Create plan",
            icon: <CheckLg size={14} />,
            tone: "brand",
            disabled: saving,
            onClick: () => void save(),
          },
        ]}
      />

      {showErrors && problems.length > 0 && (
        <div ref={errorsRef} className="wk-builder-problems" role="alert">
          <ExclamationTriangleFill size={16} aria-hidden="true" />
          <div>
            <strong>Fix these before saving</strong>
            <ul>{problems.slice(0, 6).map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        </div>
      )}

      <div className="wk-builder-grid">
        <div className="wk-builder-main">
          {/* Details */}
          <section className="surface wk-builder-card">
            <h2 className="wk-builder-h">Plan details</h2>
            <div className="wk-builder-form">
              <label className="wk-field wk-field--wide">
                <span>Name</span>
                <input
                  className={`form-control${showErrors && !draft.name.trim() ? " is-invalid" : ""}`}
                  value={draft.name}
                  maxLength={MAX_NAME + 20}
                  placeholder="e.g. Push, Pull, Legs"
                  onChange={(e) => patchDraft({ name: e.target.value })}
                />
                {nameTooLong && <small className="text-danger">Keep it under {MAX_NAME} characters.</small>}
              </label>
              <label className="wk-field">
                <span>Goal</span>
                <select className="form-select" value={draft.goal} onChange={(e) => patchDraft({ goal: e.target.value as PlanDraft["goal"] })}>
                  {GOAL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label className="wk-field">
                <span>Level</span>
                <select className="form-select" value={draft.level} onChange={(e) => patchDraft({ level: e.target.value as PlanDraft["level"] })}>
                  {LEVEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label className="wk-field wk-field--wide">
                <span>Description <em>(optional)</em></span>
                <textarea
                  className="form-control"
                  rows={2}
                  maxLength={MAX_DESCRIPTION}
                  placeholder="What is this plan for?"
                  value={draft.description}
                  onChange={(e) => patchDraft({ description: e.target.value })}
                />
              </label>
            </div>
          </section>

          {/* Schedule + day editor */}
          <section className="surface wk-builder-card">
            <h2 className="wk-builder-h">Weekly schedule</h2>
            <div className="wk-builder-week" role="tablist" aria-label="Weekdays">
              {WEEKDAY_SHORT.map((label, i) => {
                const d = draft.days.find((x) => x.weekday === i);
                return (
                  <button
                    key={label}
                    type="button"
                    role="tab"
                    aria-selected={weekday === i}
                    className={`wk-bw-day${weekday === i ? " is-selected" : ""}${d ? " is-on" : ""}`}
                    onClick={() => setWeekday(i)}
                    title={WEEKDAY_LONG[i]}
                  >
                    <span className="wk-bw-label">{label}</span>
                    <span className="wk-bw-name">{d ? d.name : "Rest"}</span>
                    {d && <span className="wk-bw-count">{pluralize(d.exercises.length, "exercise")}</span>}
                  </button>
                );
              })}
            </div>

            {weekday === null ? (
              <p className="wk-builder-hint">Pick a weekday above to start building your first training day.</p>
            ) : !day ? (
              <div className="wk-builder-rest">
                <p>{WEEKDAY_LONG[weekday]} is a rest day in this plan.</p>
                <button type="button" className="btn btn-soft" onClick={() => addDay(weekday)}>
                  <PlusLg size={13} /> Train on {WEEKDAY_LONG[weekday]}
                </button>
              </div>
            ) : (
              <div className="wk-builder-day">
                <header className="wk-builder-day-head">
                  <label className="wk-field wk-field--grow">
                    <span>{WEEKDAY_LONG[day.weekday]} session name</span>
                    <input
                      className={`form-control${showErrors && !day.name.trim() ? " is-invalid" : ""}`}
                      value={day.name}
                      maxLength={60}
                      onChange={(e) => patchDay(day.weekday, (d) => ({ ...d, name: e.target.value }))}
                    />
                  </label>
                  <div className="wk-builder-day-meta">
                    <strong>{pluralize(day.exercises.length, "exercise")}</strong>
                    <span>{pluralize(daySets, "set")} · ~{formatSessionDuration(dayMinutes * 60)}</span>
                  </div>
                  <button type="button" className="wk-builder-remove-day" onClick={requestRemoveDay}>
                    <Trash3 size={14} /> Make rest day
                  </button>
                </header>

                {day.exercises.length === 0 ? (
                  <div className={`wk-builder-empty${showErrors ? " is-error" : ""}`}>
                    <p>No exercises yet. Add a few to build this session.</p>
                  </div>
                ) : (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                    <SortableContext items={day.exercises.map((e) => e.key)} strategy={verticalListSortingStrategy}>
                      <ul className="wk-builder-list">
                        {day.exercises.map((item, i) => (
                          <BuilderExerciseRow
                            key={item.key}
                            item={item}
                            index={i}
                            onChange={(patch) => changeExercise(item.key, patch)}
                            onRemove={() => removeExercise(item.key)}
                            onOpen={() => setDetailId(item.exercise.id)}
                          />
                        ))}
                      </ul>
                    </SortableContext>
                  </DndContext>
                )}

                <button type="button" className="wk-builder-add" onClick={() => setPickerOpen(true)}>
                  <PlusLg size={14} /> Add exercises
                </button>
              </div>
            )}
          </section>
        </div>

        <aside className="wk-builder-aside">
          <section className="surface wk-builder-card wk-builder-sticky">
            <header className="wk-builder-aside-head">
              <h2 className="wk-builder-h">{day ? `${day.name || WEEKDAY_LONG[day.weekday]}: muscles` : "Muscles"}</h2>
              <MuscleLegend />
            </header>
            <MuscleMap size="lg" primary={dayMuscles.primary} secondary={dayMuscles.secondary} />
          </section>

          <section className="surface wk-builder-card">
            <h2 className="wk-builder-h">Weekly volume</h2>
            {weekVolume.length > 0 ? (
              <>
                <MuscleBars items={weekVolume} limit={8} />
                {untrained.length > 0 && (
                  <p className="wk-builder-untrained">
                    <strong>Not trained yet:</strong> {untrained.map((m) => MUSCLE_LABEL[m]).join(", ")}
                  </p>
                )}
              </>
            ) : (
              <p className="wk-builder-hint">Add exercises and you'll see how your week balances out.</p>
            )}
          </section>
        </aside>
      </div>

      <ExercisePickerModal
        show={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={addExercises}
        excludeIds={day?.exercises.map((e) => e.exercise.id) ?? []}
        title={day ? `Add to ${day.name || WEEKDAY_LONG[day.weekday]}` : "Add exercises"}
      />
      <ExerciseDetailModal exerciseId={detailId} onClose={() => setDetailId(null)} />

      <ConfirmDialog
        show={confirm === "leave"}
        title="Leave without saving?"
        message="Your changes to this plan will be lost."
        confirmLabel="Leave"
        cancelLabel="Keep editing"
        destructive
        onConfirm={goBack}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        show={confirm === "remove-day"}
        title="Make this a rest day?"
        message="The exercises you added for this day will be removed from the plan."
        confirmLabel="Make rest day"
        destructive
        onConfirm={() => day && removeDay(day.weekday)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
