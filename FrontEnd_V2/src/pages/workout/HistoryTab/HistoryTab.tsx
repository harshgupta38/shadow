import { useCallback, useEffect, useMemo, useState } from "react";
import { Fire, JournalCheck, Trophy } from "react-bootstrap-icons";
import { useNavigate } from "react-router-dom";

import { api, ApiError } from "@/api";
import type { WorkoutProgress, WorkoutProgressWeek, WorkoutSessionSummary } from "@/api";
import { IllustratedErrorState } from "@/components/ui/IllustratedErrorState/IllustratedErrorState";
import { useDateFormat } from "@/context/PlannerContext";
import { ROUTES } from "@/routes/RoutePaths";
import { formatDisplayDate, formatDuration } from "@/services/date.service";
import { ExerciseThumb } from "@/pages/workout/ExerciseThumb/ExerciseThumb";
import { MuscleBars } from "@/pages/workout/MuscleBars/MuscleBars";
import { MuscleChips } from "@/pages/workout/MuscleMap/MuscleMap";
import { Skeleton } from "@/pages/workout/Skeleton/Skeleton";
import { formatSessionDuration, formatVolume, pluralize } from "@/pages/workout/WorkoutPage.constants";
import "./HistoryTab.scss";

const PAGE = 15;

type Metric = "volume" | "sessions" | "minutes";

const METRICS: { id: Metric; label: string }[] = [
  { id: "volume", label: "Volume" },
  { id: "sessions", label: "Sessions" },
  { id: "minutes", label: "Time" },
];

const valueOf = (w: WorkoutProgressWeek, metric: Metric) =>
  metric === "volume" ? w.volume_kg : metric === "sessions" ? w.sessions : w.minutes;

// Short labels that still fit eight columns on a phone.
function compact(value: number, metric: Metric): string {
  if (value === 0) return "–";
  if (metric === "sessions") return String(value);
  if (metric === "minutes") return value < 60 ? `${value}m` : `${(value / 60).toFixed(1)}h`;
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(Math.round(value));
}

function full(value: number, metric: Metric): string {
  if (metric === "sessions") return pluralize(value, "session");
  if (metric === "minutes") return formatDuration(value);
  return formatVolume(value);
}

const weekLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

const dayParts = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return {
    day: d.toLocaleDateString("en-IN", { day: "numeric", timeZone: "UTC" }),
    month: d.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" }),
  };
};

export function HistoryTab() {
  const navigate = useNavigate();
  const dateFormat = useDateFormat();

  const [progress, setProgress] = useState<WorkoutProgress | null>(null);
  const [sessions, setSessions] = useState<WorkoutSessionSummary[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>("volume");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [prog, list] = await Promise.all([api.workout.getProgress(8), api.workout.getSessions(PAGE, 0)]);
      setProgress(prog);
      setSessions(list);
      setHasMore(list.length === PAGE);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load your history right now.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const next = await api.workout.getSessions(PAGE, sessions.length);
      setSessions((prev) => [...prev, ...next]);
      setHasMore(next.length === PAGE);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }

  const weeks = progress?.weeks ?? [];
  const max = useMemo(() => Math.max(1, ...weeks.map((w) => valueOf(w, metric))), [weeks, metric]);
  const avgSessions = weeks.length > 0 ? weeks.reduce((t, w) => t + w.sessions, 0) / weeks.length : 0;

  if (error) return <IllustratedErrorState onRetry={() => void load()} />;

  if (loading || !progress) {
    return (
      <div className="wk-hist-grid" aria-hidden="true">
        <div className="wk-hist-main"><Skeleton height={280} /><Skeleton height={320} /></div>
        <div className="wk-hist-aside"><Skeleton height={110} /><Skeleton height={260} /></div>
      </div>
    );
  }

  const openSession = (id: number) => navigate(ROUTES.WORKOUT_SESSION.replace(":sessionId", String(id)));

  return (
    <div className="wk-hist-grid">
      <div className="wk-hist-main">
        {/* Weekly chart */}
        <section className="surface wk-hist-card">
          <header className="wk-hist-head">
            <h2 className="wk-hist-h">Last 8 weeks</h2>
            <div className="wk-seg" role="tablist" aria-label="Chart metric">
              {METRICS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="tab"
                  aria-selected={metric === m.id}
                  className={metric === m.id ? "is-active" : ""}
                  onClick={() => setMetric(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </header>

          <div className="wk-chart" role="img" aria-label={`Weekly ${metric} for the last ${weeks.length} weeks`}>
            {weeks.map((w, i) => {
              const v = valueOf(w, metric);
              const isLatest = i === weeks.length - 1;
              return (
                <div key={w.week_start} className="wk-chart-col" title={`Week of ${formatDisplayDate(w.week_start, dateFormat)}: ${full(v, metric)}`}>
                  <span className="wk-chart-val">{compact(v, metric)}</span>
                  <span className="wk-chart-track">
                    <span
                      className={`wk-chart-bar${isLatest ? " is-latest" : ""}`}
                      style={{ height: `${v === 0 ? 2 : Math.max(4, (v / max) * 100)}%`, animationDelay: `${i * 40}ms` }}
                    />
                  </span>
                  <span className="wk-chart-label">{weekLabel(w.week_start)}</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Log */}
        <section className="surface wk-hist-card">
          <h2 className="wk-hist-h">Workout log</h2>
          {sessions.length === 0 ? (
            <div className="wk-hist-empty">
              <JournalCheck size={26} aria-hidden="true" />
              <p>No workouts logged yet. Finish one and it will show up here.</p>
            </div>
          ) : (
            <>
              <ul className="wk-log">
                {sessions.map((s) => {
                  const { day, month } = dayParts(s.date);
                  return (
                    <li key={s.id}>
                      <button type="button" className="wk-log-row" onClick={() => openSession(s.id)}>
                        <span className="wk-log-date"><strong>{day}</strong><small>{month}</small></span>
                        <span className="wk-log-main">
                          <span className="wk-log-name">{s.name}</span>
                          <span className="wk-log-plan">{s.plan_name ?? "Quick workout"}</span>
                          <MuscleChips primary={s.muscles} max={4} />
                        </span>
                        <span className="wk-log-stats">
                          <strong>{formatSessionDuration(s.duration_seconds)}</strong>
                          <small>{formatVolume(s.volume_kg)} · {pluralize(s.sets_done, "set")}</small>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {hasMore && (
                <div className="text-center">
                  <button type="button" className="btn btn-soft btn-sm px-4" disabled={loadingMore} onClick={() => void loadMore()}>
                    {loadingMore ? "Loading…" : "Show older workouts"}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      <aside className="wk-hist-aside">
        <section className="surface wk-hist-card">
          <div className="wk-hist-tiles">
            <div><strong>{progress.total_sessions}</strong><span>workouts logged</span></div>
            <div>
              <strong>{progress.current_streak_weeks > 0 && <Fire size={15} aria-hidden="true" />} {progress.current_streak_weeks}</strong>
              <span>week streak</span>
            </div>
            <div><strong>{avgSessions.toFixed(1)}</strong><span>sessions / week</span></div>
          </div>
        </section>

        <section className="surface wk-hist-card">
          <h2 className="wk-hist-h">Muscle balance <small>last 30 days</small></h2>
          {progress.muscles.length > 0 ? <MuscleBars items={progress.muscles} limit={8} /> : <p className="wk-hist-muted">Train a few times and your balance shows up here.</p>}
        </section>

        <section className="surface wk-hist-card">
          <h2 className="wk-hist-h"><Trophy size={13} aria-hidden="true" /> Personal records</h2>
          {progress.personal_records.length > 0 ? (
            <ul className="wk-pr">
              {progress.personal_records.map((pr) => (
                <li key={pr.exercise.id}>
                  <span className="wk-pr-thumb"><ExerciseThumb exercise={pr.exercise} imageUrl={pr.exercise.image_url} mapSize="xs" /></span>
                  <span className="wk-pr-info">
                    <strong>{pr.exercise.name}</strong>
                    <small>{formatDisplayDate(pr.date, dateFormat)}</small>
                  </span>
                  <span className="wk-pr-best">{pr.weight_kg} kg <small>× {pr.reps}</small></span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="wk-hist-muted">Your heaviest sets will be tracked here.</p>
          )}
        </section>
      </aside>
    </div>
  );
}
