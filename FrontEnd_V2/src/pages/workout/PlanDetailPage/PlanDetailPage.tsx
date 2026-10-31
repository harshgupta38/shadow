import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircleFill, Clock, Copy, HeartPulseFill, Pencil, PlayFill, Trash3Fill, XCircle } from "react-bootstrap-icons";
import { useNavigate, useParams } from "react-router-dom";

import { api, ApiError } from "@/api";
import type { PlanDay, WorkoutPlanDetail } from "@/api";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { IllustratedErrorState } from "@/components/ui/IllustratedErrorState/IllustratedErrorState";
import { PageHeader, type PageHeaderAction } from "@/components/ui/PageHeader/PageHeader";
import { useToast } from "@/context/ToastContext";
import { ROUTES } from "@/routes/RoutePaths";
import { todayIso } from "@/services/date.service";
import { ExerciseThumb } from "@/pages/workout/ExerciseThumb/ExerciseThumb";
import { MuscleBars } from "@/pages/workout/MuscleBars/MuscleBars";
import { MuscleChips, MuscleLegend, MuscleMap } from "@/pages/workout/MuscleMap/MuscleMap";
import { Skeleton } from "@/pages/workout/Skeleton/Skeleton";
import {
  EQUIPMENT_LABEL,
  GOAL_LABEL,
  LEVEL_LABEL,
  LEVEL_PILL,
  WEEKDAY_LONG,
  WEEKDAY_SHORT,
  formatDose,
  formatRest,
  formatSessionDuration,
  pluralize,
} from "@/pages/workout/WorkoutPage.constants";
import { musclesOf, setsByMuscle, workingSetCount } from "@/pages/workout/workoutMath";
import "./PlanDetailPage.scss";

function todayWeekday(): number {
  return new Date(`${todayIso()}T00:00:00`).getDay();
}

export function PlanDetailPage() {
  const { planId } = useParams();
  const id = Number(planId);
  const navigate = useNavigate();
  const toast = useToast();

  const [plan, setPlan] = useState<WorkoutPlanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weekday, setWeekday] = useState<number | null>(null);
  const [busy, setBusy] = useState<"activate" | "deactivate" | "copy" | "delete" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isInteger(id) || id <= 0) {
      setError("This plan doesn't exist.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.workout.getPlan(id);
      setPlan(data);
      const today = todayWeekday();
      setWeekday(data.days.some((d) => d.weekday === today) ? today : (data.days[0]?.weekday ?? null));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this plan right now.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const dayByWeekday = useMemo(() => new Map((plan?.days ?? []).map((d) => [d.weekday, d])), [plan]);
  const day: PlanDay | null = weekday !== null ? (dayByWeekday.get(weekday) ?? null) : null;

  const dayMuscles = useMemo(() => musclesOf(day?.exercises ?? []), [day]);
  const weekVolume = useMemo(() => setsByMuscle((plan?.days ?? []).flatMap((d) => d.exercises)), [plan]);

  const goBack = () => navigate(`${ROUTES.WORKOUT}?tab=plans`);
  const editPlan = (planToEdit: { id: number }) => navigate(ROUTES.WORKOUT_PLAN_EDIT.replace(":planId", String(planToEdit.id)));

  async function activate() {
    if (!plan || busy !== null) return;
    setBusy("activate");
    try {
      await api.workout.activatePlan(plan.id);
      setPlan({ ...plan, is_active: true });
      toast.success(`You're now following "${plan.name}".`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't switch plans. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function deactivate() {
    if (!plan || busy !== null) return;
    setBusy("deactivate");
    try {
      await api.workout.deactivatePlan();
      setPlan({ ...plan, is_active: false });
      toast.success(`You've stopped following "${plan.name}". Your history is kept.`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't stop following this plan. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function copyToMine(thenEdit: boolean) {
    if (!plan || busy !== null) return;
    setBusy("copy");
    try {
      const copy = await api.workout.duplicatePlan(plan.id);
      toast.success(thenEdit ? "Copied to your plans. Make it yours." : "Duplicated to your plans.");
      if (thenEdit) editPlan(copy);
      else navigate(ROUTES.WORKOUT_PLAN_DETAIL.replace(":planId", String(copy.id)));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't copy this plan. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!plan || busy !== null) return;
    setBusy("delete");
    try {
      await api.workout.deletePlan(plan.id);
      toast.success("Plan deleted.");
      goBack();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't delete this plan. Please try again.");
      setBusy(null);
      setConfirmDelete(false);
    }
  }

  if (error) {
    return (
      <div className="wk-page">
        <PageHeader title="Workout plan" icon={<HeartPulseFill />} onBack={goBack} />
        <IllustratedErrorState onRetry={() => void load()} />
      </div>
    );
  }

  if (loading || !plan) {
    return (
      <div className="wk-page">
        <PageHeader title="Workout plan" icon={<HeartPulseFill />} onBack={goBack} />
        <div className="wk-pd-grid" aria-hidden="true">
          <div className="wk-pd-main"><Skeleton height={130} /><Skeleton height={420} /></div>
          <div className="wk-pd-aside"><Skeleton height={330} /></div>
        </div>
      </div>
    );
  }

  const isCustom = plan.source === "custom";
  const actions: PageHeaderAction[] = [];
  if (plan.is_active) {
    actions.push({ key: "stop", label: busy === "deactivate" ? "Stopping…" : "Stop following", icon: <XCircle size={14} />, tone: "soft", disabled: busy !== null, onClick: () => void deactivate() });
  } else {
    actions.push({ key: "use", label: busy === "activate" ? "Switching…" : "Use this plan", icon: <PlayFill size={14} />, tone: "brand", disabled: busy !== null, onClick: () => void activate() });
  }
  if (isCustom) {
    actions.push(
      { key: "edit", label: "Edit", icon: <Pencil size={14} />, tone: "soft", disabled: busy !== null, onClick: () => editPlan(plan) },
      { key: "dup", label: "Duplicate", icon: <Copy size={14} />, tone: "soft", disabled: busy !== null, onClick: () => void copyToMine(false) },
      { key: "del", label: "Delete", icon: <Trash3Fill size={14} />, tone: "danger", disabled: busy !== null, onClick: () => setConfirmDelete(true) },
    );
  } else {
    actions.push({ key: "custom", label: busy === "copy" ? "Copying…" : "Customize", icon: <Pencil size={14} />, tone: "soft", disabled: busy !== null, onClick: () => void copyToMine(true) });
  }

  const totalSets = workingSetCount(day?.exercises ?? []);

  return (
    <div className="wk-page">
      <PageHeader
        title={plan.name}
        subtitle={`${GOAL_LABEL[plan.goal]} · ${LEVEL_LABEL[plan.level]} · ${plan.source === "custom" ? "Your plan" : "Ready-made plan"}`}
        icon={<HeartPulseFill />}
        actions={actions}
        onBack={goBack}
      />

      <div className="wk-pd-grid">
        <div className="wk-pd-main">
          {/* Overview */}
          <section className="surface wk-pd-card">
            {plan.description && <p className="wk-pd-desc">{plan.description}</p>}
            <div className="wk-pd-facts">
              {plan.is_active && <span className="pill pill-success"><CheckCircleFill size={11} aria-hidden="true" /> Active</span>}
              <span className={`pill ${LEVEL_PILL[plan.level]}`}>{LEVEL_LABEL[plan.level]}</span>
              <span className="pill">{pluralize(plan.days_per_week, "day")} a week</span>
              <span className="pill"><Clock size={11} aria-hidden="true" /> ~{formatSessionDuration(plan.avg_minutes * 60)} per session</span>
              {plan.equipment.map((eq) => <span key={eq} className="pill">{EQUIPMENT_LABEL[eq]}</span>)}
            </div>
          </section>

          {/* Weekly schedule */}
          <section className="surface wk-pd-card">
            <h2 className="wk-pd-h">Weekly schedule</h2>
            <div className="wk-pd-week" role="tablist" aria-label="Training days">
              {WEEKDAY_SHORT.map((label, i) => {
                const d = dayByWeekday.get(i);
                return (
                  <button
                    key={label}
                    type="button"
                    role="tab"
                    aria-selected={weekday === i}
                    disabled={!d}
                    className={`wk-pd-day${weekday === i ? " is-selected" : ""}${d ? "" : " is-rest"}`}
                    onClick={() => setWeekday(i)}
                    title={WEEKDAY_LONG[i]}
                  >
                    <span className="wk-pd-day-label">{label}</span>
                    <span className="wk-pd-day-name">{d ? d.name : "Rest"}</span>
                    {d && <span className="wk-pd-day-count">{pluralize(d.exercises.length, "exercise")}</span>}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Selected day */}
          {day && (
            <section className="surface wk-pd-card">
              <header className="wk-pd-day-head">
                <div>
                  <h2 className="wk-pd-h wk-pd-h--lg">{day.name}</h2>
                  <p className="wk-pd-sub">
                    {WEEKDAY_LONG[day.weekday]} · {pluralize(day.exercises.length, "exercise")} · {pluralize(totalSets, "set")} · ~{formatSessionDuration(day.estimated_minutes * 60)}
                  </p>
                </div>
              </header>

              <ul className="wk-pd-list">
                {day.exercises.map((pe, i) => (
                  <li key={pe.id ?? `${pe.exercise.id}-${i}`}>
                    <button type="button" className="wk-pd-ex" onClick={() => navigate(ROUTES.WORKOUT_EXERCISE.replace(":exerciseId", String(pe.exercise.id)))}>
                      <span className="wk-pd-ex-num">{i + 1}</span>
                      <span className="wk-pd-ex-thumb">
                        <ExerciseThumb exercise={pe.exercise} imageUrl={pe.exercise.image_url} mapSize="xs" />
                      </span>
                      <span className="wk-pd-ex-info">
                        <span className="wk-pd-ex-name">{pe.exercise.name}</span>
                        <MuscleChips primary={pe.exercise.primary_muscles} secondary={pe.exercise.secondary_muscles} max={3} />
                      </span>
                      <span className="wk-pd-ex-dose">
                        <strong>{formatDose(pe.exercise.measure, pe.sets, pe.reps)}</strong>
                        <small>
                          rest {formatRest(pe.rest_seconds)}
                          {pe.weight_kg !== null ? ` · ${pe.weight_kg} kg` : ""}
                        </small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="wk-pd-aside">
          <section className="surface wk-pd-card">
            <header className="wk-pd-aside-head">
              <h2 className="wk-pd-h">{day ? `${day.name}: muscles` : "Muscles"}</h2>
              <MuscleLegend />
            </header>
            <MuscleMap size="lg" primary={dayMuscles.primary} secondary={dayMuscles.secondary} />
          </section>

          <section className="surface wk-pd-card">
            <h2 className="wk-pd-h">Weekly volume</h2>
            <p className="wk-pd-sub wk-pd-sub--tight">Sets per muscle across the whole week. Secondary muscles count half.</p>
            <MuscleBars items={weekVolume} limit={8} />
          </section>
        </aside>
      </div>

      <ConfirmDialog
        show={confirmDelete}
        title="Delete this plan?"
        message="Your logged workouts stay in your history. The plan itself can't be recovered."
        confirmLabel="Delete plan"
        destructive
        busy={busy === "delete"}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
