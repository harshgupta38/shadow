import { useEffect, useMemo, useState } from "react";
import { closestCenter, DndContext } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ChevronRight, LightbulbFill, PlusLg, Trash3 } from "react-bootstrap-icons";

import { api } from "@/api";
import { ApiError } from "@/api/client";
import type { ExerciseSummary, WorkoutPlanDetail, WorkoutPlanProposal } from "@/api/types";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { ANIMATION } from "@/constant/tuning";
import { ExerciseDetailModal } from "@/pages/workout/ExerciseDetailModal/ExerciseDetailModal";
import { ExercisePickerModal } from "@/pages/workout/ExercisePickerModal/ExercisePickerModal";
import { MuscleBars } from "@/pages/workout/MuscleBars/MuscleBars";
import { BuilderExerciseRow } from "@/pages/workout/PlanBuilderPage/BuilderExerciseRow/BuilderExerciseRow";
import {
  MAX_DESCRIPTION,
  MAX_NAME,
  draftFromProposal,
  toSaveRequest,
  validateDraft,
  type PlanDraft,
} from "@/pages/workout/PlanBuilderPage/PlanBuilderPage.constants";
import { usePlanDraft } from "@/pages/workout/PlanBuilderPage/usePlanDraft";
import {
  GOAL_OPTIONS,
  LEVEL_OPTIONS,
  WEEKDAY_LONG,
  WEEKDAY_SHORT,
  countSets,
  estimateMinutes,
  formatSessionDuration,
  pluralize,
  setsByMuscle,
} from "@/pages/workout/WorkoutPage.constants";

import "@/pages/my_goals/GoalCreationWizard/GoalCreationWizard.scss";
import "@/pages/assistant/RefinedGoalReviewPanel/RefinedGoalReviewPanel.scss";
import "./WorkoutPlanReviewPanel.scss";

interface WorkoutPlanReviewPanelProps {
  proposal: WorkoutPlanProposal;
  onClose: () => void;
  onSaved?: (plan: WorkoutPlanDetail) => void | Promise<void>;
}

export function WorkoutPlanReviewPanel({ proposal, onClose, onSaved }: WorkoutPlanReviewPanelProps) {
  const [initialDraft] = useState(() => draftFromProposal(proposal.plan));
  const { draft, weekday, setWeekday, day, patchDraft, patchDay, addDay, removeDay: removeDayFromDraft, addExercises: addPickedExercises, changeExercise, removeExercise, sensors, onDragEnd } =
    usePlanDraft(initialDraft);
  const [follow, setFollow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [confirmRemoveDay, setConfirmRemoveDay] = useState(false);

  function requestClose() {
    if (isClosing) return;
    setIsClosing(true);
    window.setTimeout(onClose, ANIMATION.PANEL_SLIDE_OUT_MS);
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // A popup opened from the panel (exercise picker, details) takes the Escape first.
      if (event.key === "Escape" && !saving && !document.querySelector(".modal.show")) requestClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saving, isClosing]);

  // The exercise popups sit above the panel only while this class is on the page.
  useEffect(() => {
    document.body.classList.add("wk-review-open");
    return () => document.body.classList.remove("wk-review-open");
  }, []);

  // ── Draft editing ──────────────────────────────────────────────────────────
  // A save error describes the plan as it was, so any edit clears it.
  useEffect(() => {
    setGeneralError(null);
  }, [draft]);

  function removeDay(target: number) {
    removeDayFromDraft(target);
    setConfirmRemoveDay(false);
  }

  function requestRemoveDay() {
    if (!day) return;
    if (day.exercises.length > 0) setConfirmRemoveDay(true);
    else removeDay(day.weekday);
  }

  function addExercises(picked: ExerciseSummary[]) {
    addPickedExercises(picked);
    setPickerOpen(false);
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const problems = useMemo(() => validateDraft(draft), [draft]);
  const allExercises = useMemo(() => draft.days.flatMap((d) => d.exercises), [draft.days]);
  const weekVolume = useMemo(() => setsByMuscle(allExercises), [allExercises]);
  const weekSets = countSets(allExercises);
  const dayMinutes = day ? estimateMinutes(day.exercises) : 0;

  // ── Save ───────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (saving) return;
    if (problems.length > 0) {
      setShowErrors(true);
      return;
    }
    setSaving(true);
    setGeneralError(null);
    try {
      const plan = await api.workout.savePlanFromProposal({
        proposal_id: proposal.proposal_id,
        plan: toSaveRequest(draft),
        activate: follow,
      });
      await onSaved?.(plan);
      requestClose();
    } catch (saveError) {
      setGeneralError(saveError instanceof ApiError ? saveError.message : "We could not save the plan right now. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const footerError = showErrors && problems.length > 0 ? problems[0] : generalError;
  const nameInvalid = showErrors && !draft.name.trim();

  return (
    <div className="goal-refined-review-backdrop">
      <section className={`goal-refined-review-panel wk-rp${isClosing ? " is-closing" : ""}`} aria-labelledby="workout-plan-review-title">
        <header className="goal-wizard-header p-0">
          <div className="goal-wizard-header-main w-100">
            <div className="goal-wizard-header-copy w-100">
              <h3 id="workout-plan-review-title" className="d-flex align-items-center justify-content-between">
                Review Workout Plan
                <button
                  type="button"
                  className="btn btn-ghost btn-icon goal-wizard-close"
                  onClick={requestClose}
                  aria-label="Close workout plan review"
                  disabled={saving}
                >
                  <ChevronRight size={25} />
                </button>
              </h3>
              <p>Your coach drafted this plan. Change anything you like, then save it to your plans.</p>
            </div>
          </div>
        </header>

        <div className="goal-wizard-body less-padding">
          <div className="goal-wizard-review wk-rp-stack">
            {proposal.plan.rationale && (
              <aside className="wk-rp-why">
                <LightbulbFill size={16} aria-hidden="true" />
                <div>
                  <strong>Why this plan</strong>
                  <p>{proposal.plan.rationale}</p>
                </div>
              </aside>
            )}

            {/* Details */}
            <section className="wk-rp-card">
              <h4 className="wk-rp-h">Plan details</h4>
              <div className="wk-rp-form">
                <label className="wk-rp-field wk-rp-field--wide">
                  <span>Name</span>
                  <input
                    className={`form-control${nameInvalid ? " is-invalid" : ""}`}
                    value={draft.name}
                    maxLength={MAX_NAME + 20}
                    disabled={saving}
                    onChange={(e) => patchDraft({ name: e.target.value })}
                  />
                  {draft.name.length > MAX_NAME && <small className="text-danger">Keep it under {MAX_NAME} characters.</small>}
                </label>
                <label className="wk-rp-field">
                  <span>Goal</span>
                  <select className="form-select" value={draft.goal} disabled={saving} onChange={(e) => patchDraft({ goal: e.target.value as PlanDraft["goal"] })}>
                    {GOAL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
                <label className="wk-rp-field">
                  <span>Level</span>
                  <select className="form-select" value={draft.level} disabled={saving} onChange={(e) => patchDraft({ level: e.target.value as PlanDraft["level"] })}>
                    {LEVEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
                <label className="wk-rp-field wk-rp-field--wide">
                  <span>Description <em>(optional)</em></span>
                  <textarea
                    className="form-control"
                    rows={2}
                    maxLength={MAX_DESCRIPTION}
                    disabled={saving}
                    value={draft.description}
                    onChange={(e) => patchDraft({ description: e.target.value })}
                  />
                </label>
              </div>
            </section>

            {/* Schedule + day editor */}
            <section className="wk-rp-card">
              <header className="wk-rp-card-head">
                <h4 className="wk-rp-h">Weekly schedule</h4>
                <span className="wk-rp-meta">
                  {pluralize(draft.days.length, "day")} · {pluralize(allExercises.length, "exercise")} · {pluralize(weekSets, "set")} a week
                </span>
              </header>

              <div className="wk-rp-week" role="tablist" aria-label="Weekdays">
                {WEEKDAY_SHORT.map((label, i) => {
                  const planned = draft.days.find((x) => x.weekday === i);
                  return (
                    <button
                      key={label}
                      type="button"
                      role="tab"
                      aria-selected={weekday === i}
                      aria-label={planned ? `${WEEKDAY_LONG[i]}: ${planned.name}` : `${WEEKDAY_LONG[i]}: rest day`}
                      className={`wk-rp-day${planned ? " is-on" : ""}${weekday === i ? " is-selected" : ""}`}
                      onClick={() => setWeekday(i)}
                    >
                      <span className="wk-rp-day-label">{label}</span>
                      <span className="wk-rp-day-name">{planned ? planned.name : "Rest"}</span>
                    </button>
                  );
                })}
              </div>

              {weekday === null ? (
                <p className="wk-rp-hint">Pick a weekday above to add a training day.</p>
              ) : !day ? (
                <div className="wk-rp-rest">
                  <p>{WEEKDAY_LONG[weekday]} is a rest day in this plan.</p>
                  <button type="button" className="btn btn-soft btn-sm" disabled={saving} onClick={() => addDay(weekday)}>
                    <PlusLg size={13} /> Train on {WEEKDAY_LONG[weekday]}
                  </button>
                </div>
              ) : (
                <div className="wk-rp-daybox">
                  <div className="wk-rp-dayhead">
                    <label className="wk-rp-field wk-rp-field--grow">
                      <span>{WEEKDAY_LONG[day.weekday]} session name</span>
                      <input
                        className={`form-control${showErrors && !day.name.trim() ? " is-invalid" : ""}`}
                        value={day.name}
                        maxLength={60}
                        disabled={saving}
                        onChange={(e) => patchDay(day.weekday, (d) => ({ ...d, name: e.target.value }))}
                      />
                    </label>
                    <div className="wk-rp-daymeta">
                      <strong>{pluralize(day.exercises.length, "exercise")}</strong>
                      <span>{pluralize(countSets(day.exercises), "set")} · ~{formatSessionDuration(dayMinutes * 60)}</span>
                    </div>
                    <button type="button" className="wk-rp-removeday" disabled={saving} onClick={requestRemoveDay}>
                      <Trash3 size={14} /> Make rest day
                    </button>
                  </div>

                  {day.exercises.length === 0 ? (
                    <div className={`wk-rp-empty${showErrors ? " is-error" : ""}`}>No exercises yet. Add a few to build this session.</div>
                  ) : (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                      <SortableContext items={day.exercises.map((e) => e.key)} strategy={verticalListSortingStrategy}>
                        <ul className="wk-rp-list">
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

                  <button type="button" className="wk-rp-add" disabled={saving} onClick={() => setPickerOpen(true)}>
                    <PlusLg size={14} /> Add exercises
                  </button>
                </div>
              )}
            </section>

            {/* Balance */}
            {weekVolume.length > 0 && (
              <section className="wk-rp-card">
                <h4 className="wk-rp-h">Weekly volume</h4>
                <p className="wk-rp-hint">Sets per muscle across the week. Helping muscles count half.</p>
                <MuscleBars items={weekVolume} limit={8} />
              </section>
            )}

            <div className="wk-rp-footer">
              <label className="wk-rp-follow">
                <input type="checkbox" checked={follow} disabled={saving} onChange={(e) => setFollow(e.target.checked)} />
                <span>Start following this plan today</span>
              </label>
              <div className="goal-wizard-footer">
                <button type="button" className="btn btn-brand" onClick={() => void handleSave()} disabled={saving}>
                  {saving ? "Saving..." : "Save plan"}
                </button>
                <button type="button" className="btn btn-soft" onClick={requestClose} disabled={saving}>
                  Cancel
                </button>
              </div>
              {footerError && <div className="alert alert-danger goal-wizard-inline-error mb-0">{footerError}</div>}
            </div>
          </div>
        </div>
      </section>

      <ExercisePickerModal
        show={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={addExercises}
        excludeIds={day?.exercises.map((e) => e.exercise.id) ?? []}
        title={day ? `Add to ${day.name || WEEKDAY_LONG[day.weekday]}` : "Add exercises"}
      />
      <ExerciseDetailModal exerciseId={detailId} onClose={() => setDetailId(null)} />
      <ConfirmDialog
        show={confirmRemoveDay}
        title="Make this a rest day?"
        message="The exercises in this day will be removed from the plan."
        confirmLabel="Make rest day"
        destructive
        onConfirm={() => day && removeDay(day.weekday)}
        onCancel={() => setConfirmRemoveDay(false)}
      />
    </div>
  );
}
