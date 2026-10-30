import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircleFill,
  ClipboardCheck,
  Circle,
  MoonStarsFill,
  PlayFill,
  PlusLg,
  XCircleFill,
} from "react-bootstrap-icons";
import { useNavigate } from "react-router-dom";

import { api, ApiError } from "@/api";
import type { WorkoutOverview, WorkoutWeekDay } from "@/api";
import { IllustratedErrorState } from "@/components/ui/IllustratedErrorState/IllustratedErrorState";
import { useToast } from "@/context/ToastContext";
import { ROUTES } from "@/routes/RoutePaths";
import { formatDuration } from "@/services/date.service";
import { ExerciseThumb } from "@/pages/workout/ExerciseThumb/ExerciseThumb";
import { MuscleBars } from "@/pages/workout/MuscleBars/MuscleBars";
import { MuscleChips, MuscleLegend, MuscleMap } from "@/pages/workout/MuscleMap/MuscleMap";
import { Skeleton } from "@/pages/workout/Skeleton/Skeleton";
import {
  WEEKDAY_LONG,
  WEEKDAY_SHORT,
  formatSessionDuration,
  formatVolume,
  pluralize,
} from "@/pages/workout/WorkoutPage.constants";
import { musclesOf } from "@/pages/workout/workoutMath";
import "./TodayTab.scss";

interface TodayTabProps {
  onOpenExercise: (id: number) => void;
}

const STATUS_LABEL: Record<WorkoutWeekDay["status"], string> = {
  done: "Done",
  today: "Today",
  upcoming: "Upcoming",
  missed: "Missed",
  rest: "Rest",
};

function StatusIcon({ status }: { status: WorkoutWeekDay["status"] }) {
  if (status === "done") return <CheckCircleFill size={16} aria-hidden="true" />;
  if (status === "missed") return <XCircleFill size={16} aria-hidden="true" />;
  if (status === "today") return <PlayFill size={18} aria-hidden="true" />;
  if (status === "upcoming") return <Circle size={15} aria-hidden="true" />;
  return <MoonStarsFill size={13} aria-hidden="true" />;
}

export function TodayTab({ onOpenExercise }: TodayTabProps) {
  const navigate = useNavigate();
  const toast = useToast();

  const [data, setData] = useState<WorkoutOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.workout.getOverview());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load your workout right now.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const day = data?.today_plan_day ?? null;
  const dayMuscles = useMemo(() => musclesOf(day?.exercises ?? []), [day]);

  const openSession = (id: number) => navigate(ROUTES.WORKOUT_SESSION.replace(":sessionId", String(id)));

  async function start(planDayId: number | null, name: string | null) {
    setStarting(true);
    try {
      const session = await api.workout.startSession({ plan_day_id: planDayId, name });
      openSession(session.id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't start the workout. Please try again.");
      setStarting(false);
    }
  }

  async function stopFollowing(planName: string) {
    setStopping(true);
    try {
      await api.workout.deactivatePlan();
      toast.success(`You've stopped following "${planName}". Your history is kept.`);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't stop following this plan. Please try again.");
    } finally {
      setStopping(false);
    }
  }

  if (error) return <IllustratedErrorState onRetry={() => void load()} />;

  if (loading || !data) {
    return (
      <div className="wk-today-grid" aria-hidden="true">
        <div className="wk-today-main"><Skeleton height={380} /><Skeleton height={110} /></div>
        <div className="wk-today-aside"><Skeleton height={120} /><Skeleton height={300} /></div>
      </div>
    );
  }

  const todayLabel = WEEKDAY_LONG[new Date(`${data.today_date}T00:00:00`).getDay()];
  const nextUp = data.week.find((d) => d.status === "upcoming");
  const progressPct = data.sessions_target > 0 ? Math.min(100, (data.sessions_this_week / data.sessions_target) * 100) : 0;

  // A workout can stay open after its plan is stopped or changes. The Resume button lives on the day's card,
  // so when that card isn't showing (no plan, rest day, or today already logged) surface it here instead.
  const openSessionId = data.in_progress_session_id;
  const showResume = openSessionId !== null && (!day || data.completed_today !== null);
  const resumeBanner = showResume ? (
    <div className="wk-today-resume" role="status">
      <PlayFill size={16} aria-hidden="true" />
      <div>
        <strong>You have a workout in progress.</strong>
        <span>Everything you logged so far is saved.</span>
      </div>
      <button
        type="button"
        className="btn btn-brand btn-sm"
        onClick={() => {
          if (openSessionId !== null) openSession(openSessionId);
        }}
      >
        Resume
      </button>
    </div>
  ) : null;

  // ── No plan yet ────────────────────────────────────────────────────────────
  if (!data.active_plan) {
    return (
      <>
        {resumeBanner}
        <section className="surface wk-today-empty">
          <div className="wk-today-empty-icon"><ClipboardCheck size={28} /></div>
          <h2>Pick a plan and let's go</h2>
          <p>
            Follow a ready-made programme, or build your own around the days and exercises you like.
            Either way, today's workout shows up right here.
          </p>
          <div className="wk-today-empty-actions">
            <button type="button" className="btn btn-brand" onClick={() => navigate(`${ROUTES.WORKOUT}?tab=plans`)}>
              Browse plans
            </button>
            <button type="button" className="btn btn-soft" onClick={() => navigate(ROUTES.WORKOUT_PLAN_CREATE)}>
              Build my own
            </button>
            <button type="button" className="btn btn-outline-secondary" disabled={starting} onClick={() => void start(null, null)}>
              Quick workout
            </button>
          </div>
        </section>
      </>
    );
  }

  const activePlan = data.active_plan;
  const totalSets = day?.exercises.reduce((t, e) => t + e.sets, 0) ?? 0;
  const done = data.completed_today;

  return (
    <div className="wk-today-grid">
      <div className="wk-today-main">
        {resumeBanner}
        {/* Today's session */}
        <section className="surface wk-today-card">
          <header className="wk-today-head">
            <div>
              <span className="wk-today-eyebrow">{todayLabel} · {data.active_plan.name}</span>
              <h2 className="wk-today-title">{day ? day.name : data.is_rest_day ? "Rest day" : "No workout planned"}</h2>
              {day && (
                <p className="wk-today-sub">
                  {pluralize(day.exercises.length, "exercise")} · {pluralize(totalSets, "set")} · ~{formatSessionDuration(day.estimated_minutes * 60)}
                </p>
              )}
            </div>

            {day && !done && (
              <button
                type="button"
                className="btn btn-brand wk-today-cta"
                disabled={starting}
                onClick={() => (data.in_progress_session_id ? openSession(data.in_progress_session_id) : void start(day.id, day.name))}
              >
                <PlayFill size={18} />
                {starting ? "Starting…" : data.in_progress_session_id ? "Resume workout" : "Start workout"}
              </button>
            )}
          </header>

          {done && (
            <div className="wk-today-done" role="status">
              <CheckCircleFill size={20} aria-hidden="true" />
              <div>
                <strong>Nicely done. Today's workout is complete.</strong>
                <span>
                  {formatSessionDuration(done.duration_seconds)} · {formatVolume(done.volume_kg)} · {pluralize(done.sets_done, "set")}
                </span>
              </div>
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => openSession(done.id)}>
                View summary
              </button>
            </div>
          )}

          {day ? (
            <ul className="wk-today-list">
              {day.exercises.map((pe, i) => (
                <li key={pe.id ?? `${pe.exercise.id}-${i}`}>
                  <button type="button" className="wk-today-ex" onClick={() => onOpenExercise(pe.exercise.id)}>
                    <span className="wk-today-ex-thumb">
                      <ExerciseThumb exercise={pe.exercise} imageUrl={pe.exercise.image_url} mapSize="xs" />
                    </span>
                    <span className="wk-today-ex-info">
                      <span className="wk-today-ex-name">{pe.exercise.name}</span>
                      <MuscleChips primary={pe.exercise.primary_muscles} max={2} />
                    </span>
                    <span className="wk-today-ex-dose">{pe.sets} × {pe.reps}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="wk-today-rest">
              <MoonStarsFill size={26} aria-hidden="true" />
              <p>
                {data.is_rest_day
                  ? "Recovery is when your muscles actually grow. Sleep well, eat enough, and stay loose."
                  : "Nothing is planned for today."}
                {nextUp && <> Next session: <strong>{nextUp.label}</strong> on {WEEKDAY_LONG[nextUp.weekday]}.</>}
              </p>
              <button type="button" className="btn btn-soft btn-sm" disabled={starting} onClick={() => void start(null, null)}>
                <PlusLg size={13} /> Quick workout anyway
              </button>
            </div>
          )}

          {done && day && (
            <button type="button" className="btn btn-outline-secondary btn-sm align-self-start" disabled={starting} onClick={() => void start(null, null)}>
              <PlusLg size={13} /> Log another workout
            </button>
          )}
        </section>

        {/* This week */}
        <section className="surface wk-today-card">
          <header className="wk-today-week-head">
            <h2 className="wk-h">This week</h2>
            <button type="button" className="btn btn-outline-secondary btn-sm" disabled={stopping} onClick={() => void stopFollowing(activePlan.name)}>
              {stopping ? "Stopping…" : "Stop following"}
            </button>
          </header>
          <div className="wk-week">
            {data.week.map((d) => (
              <div key={d.date} className={`wk-week-tile is-${d.status}`} title={`${WEEKDAY_LONG[d.weekday]}: ${STATUS_LABEL[d.status]}`}>
                <span className="wk-week-day">{WEEKDAY_SHORT[d.weekday]}</span>
                <span className="wk-week-icon"><StatusIcon status={d.status} /></span>
                <span className="wk-week-name">{d.label ?? "Rest"}</span>
                <span className="visually-hidden">{STATUS_LABEL[d.status]}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <aside className="wk-today-aside">
        <section className="surface wk-today-card">
          <h2 className="wk-h">Week so far</h2>
          <div className="wk-stats">
            <div className="wk-stat wk-stat--wide">
              <div className="wk-stat-top">
                <strong>{data.sessions_this_week}<small> / {data.sessions_target}</small></strong>
                <span>sessions</span>
              </div>
              <div className="wk-stat-bar" role="progressbar" aria-valuemin={0} aria-valuemax={data.sessions_target} aria-valuenow={data.sessions_this_week} aria-label="Sessions this week">
                <span style={{ width: `${progressPct}%` }} />
              </div>
            </div>
            <div className="wk-stat"><strong>{formatVolume(data.volume_kg_week)}</strong><span>lifted</span></div>
            <div className="wk-stat"><strong>{formatDuration(data.minutes_week)}</strong><span>training</span></div>
          </div>
        </section>

        {day && (
          <section className="surface wk-today-card">
            <header className="wk-today-map-head">
              <h2 className="wk-h">Muscles today</h2>
              <MuscleLegend />
            </header>
            <MuscleMap size="md" primary={dayMuscles.primary} secondary={dayMuscles.secondary} />
          </section>
        )}

        <section className="surface wk-today-card">
          <h2 className="wk-h">Muscles trained this week</h2>
          {data.muscles_this_week.length > 0 ? (
            <MuscleBars items={data.muscles_this_week} limit={6} />
          ) : (
            <p className="wk-muted">Finish a workout and you'll see which muscles got the work.</p>
          )}
        </section>
      </aside>
    </div>
  );
}
