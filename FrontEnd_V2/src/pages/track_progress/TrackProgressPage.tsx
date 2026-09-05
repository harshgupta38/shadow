import { useEffect, useMemo, useState } from "react";
import { ExclamationCircle, GraphUp, PlusLg } from "react-bootstrap-icons";
import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import { useToast } from "@/context/ToastContext";
import { MetricHabitCard } from "./MetricHabitCard/MetricHabitCard";
import { SimpleHabitCard } from "./SimpleHabitCard/SimpleHabitCard";
import { TrackHabitPanel } from "./TrackHabitPanel/TrackHabitPanel";
import { trackProgressApi } from "@/api/track_progress";
import type { EligibleHabitItem, EligibleTaskItem, HabitTrackItem, TaskTrackItem } from "@/api/types";
import {
  TODAY_COL,
  WEEK_DAY_LABELS,
  WEEK_RANGE,
  toMetricData,
  toMetricDataFromTask,
  toSimpleData,
  toSimpleDataFromTask,
} from "./TrackProgressPage.constants";
import "@/pages/track_progress/TrackProgressPage.scss";


// ── Ghost Shell (shared layout for empty / loading / error) ──────────────────

const GHOST_WIDTHS = [58, 75, 50, 68, 62];

interface GhostShellProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  cta?: { label: React.ReactNode; onClick: () => void };
}

function GhostShell({ icon, title, subtitle, cta }: GhostShellProps) {
  return (
    <div className="tp-empty">
      <div className="tp-empty-ghost-shell">
        <div className="tp-matrix-shell">
          <div className="tp-matrix-wrap">
            <div className="tp-matrix-row tp-matrix-row--header">
              <div className="tp-matrix-label tp-matrix-label--hdr">Habit</div>
              {WEEK_DAY_LABELS.map((d, i) => (
                <div key={`${d}-${i}`} className={`tp-matrix-day-hdr${i === TODAY_COL ? " tp-matrix-day-hdr--today" : ""}`}>{d}</div>
              ))}
              <div className="tp-matrix-pct-hdr">Progress</div>
            </div>
            {GHOST_WIDTHS.map((w, i) => (
              <div key={i} className="tp-matrix-row">
                <div className="tp-matrix-label">
                  <span className="tp-ghost-name" style={{ width: `${w}%` }} />
                </div>
                {Array.from({ length: 7 }).map((_, d) => (
                  <div key={d} className="tp-matrix-cell tp-matrix-cell--miss" />
                ))}
                <div className="tp-matrix-pct-cell">
                  <span className="tp-ghost-pct" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="tp-empty-core">
        <div className="tp-empty-icon">{icon}</div>
        <h3 className="tp-empty-title">{title}</h3>
        <p className="tp-empty-sub">{subtitle}</p>
        {cta && (
          <button className="btn btn-primary btn-sm" onClick={cta.onClick}>
            {cta.label}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Weekly Accountability Matrix ──────────────────────────────────────────────

interface MatrixRow {
  id: number;
  title: string;
  week: boolean[];
}

function WeeklyMatrix({ rows }: { rows: MatrixRow[] }) {
  return (
    <div className="tp-matrix-wrap">
      <div className="tp-matrix-row tp-matrix-row--header">
        <div className="tp-matrix-label tp-matrix-label--hdr">Habit</div>
        {WEEK_DAY_LABELS.map((d, i) => (
          <div
            key={`${d}-${i}`}
            className={`tp-matrix-day-hdr${i === TODAY_COL ? " tp-matrix-day-hdr--today" : ""}`}
          >
            {d}
          </div>
        ))}
        <div className="tp-matrix-pct-hdr">Progress</div>
      </div>

      {rows.map(r => {
        const pct = Math.round((r.week.filter(Boolean).length / 7) * 100);
        return (
          <div key={r.id} className="tp-matrix-row">
            <div className="tp-matrix-label">
              <span className="tp-matrix-habit-name">{r.title}</span>
            </div>
            {r.week.map((done, i) => (
              <div
                key={i}
                className={[
                  "tp-matrix-cell",
                  done ? "tp-matrix-cell--done" : "tp-matrix-cell--miss",
                  i === TODAY_COL ? "tp-matrix-cell--today" : "",
                  i > TODAY_COL ? "tp-matrix-cell--future" : "",
                ].filter(Boolean).join(" ")}
              />
            ))}
            <div className="tp-matrix-pct-cell">
              <span className="tp-matrix-pct-text">{pct}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type LoadState = "loading" | "error" | "loaded";

export function TrackProgressPage() {
  const toast = useToast();

  const [habits, setHabits] = useState<HabitTrackItem[]>([]);
  const [tasks, setTasks] = useState<TaskTrackItem[]>([]);
  const [allHabits, setAllHabits] = useState<EligibleHabitItem[]>([]);
  const [allTasks, setAllTasks] = useState<EligibleTaskItem[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [panelOpen, setPanelOpen] = useState(false);

  function fetchTrackData() {
    setLoadState("loading");
    Promise.all([trackProgressApi.getHabits(), trackProgressApi.getTasks()])
      .then(([habitData, taskData]) => {
        setHabits(habitData);
        setTasks(taskData);
        setLoadState("loaded");
      })
      .catch(() => setLoadState("error"));
  }

  useEffect(() => { fetchTrackData(); }, []);

  function openPanel() {
    Promise.all([trackProgressApi.getEligibleHabits(), trackProgressApi.getEligibleTasks()])
      .then(([habitData, taskData]) => {
        setAllHabits(habitData);
        setAllTasks(taskData);
        setPanelOpen(true);
      })
      .catch(() => toast.error("Could not load items. Please try again."));
  }

  function handlePanelSave(enabledHabitIds: Set<number>, enabledTaskIds: Set<number>) {
    Promise.all([
      trackProgressApi.setTracking(Array.from(enabledHabitIds)),
      trackProgressApi.setTaskTracking(Array.from(enabledTaskIds)),
    ])
      .then(() => {
        setPanelOpen(false);
        Promise.all([
          trackProgressApi.getHabits(),
          trackProgressApi.getTasks(),
          trackProgressApi.getEligibleHabits(),
          trackProgressApi.getEligibleTasks(),
        ]).then(([habitData, taskData, allHabitData, allTaskData]) => {
          setHabits(habitData);
          setTasks(taskData);
          setAllHabits(allHabitData);
          setAllTasks(allTaskData);
        }).catch(() => toast.error("Tracking saved, but we could not refresh. Please reload."));
      })
      .catch(() => toast.error("Could not save tracking changes. Please try again."));
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const metricHabits = useMemo(
    () => habits.filter(h => h.planner_type === "metric").map(toMetricData),
    [habits],
  );
  const simpleHabits = useMemo(
    () => habits.filter(h => h.planner_type === "simple").map(toSimpleData),
    [habits],
  );
  const metricTasks = useMemo(
    () => tasks.filter(t => t.planner_type === "metric").map(toMetricDataFromTask),
    [tasks],
  );
  const simpleTasks = useMemo(
    () => tasks.filter(t => t.planner_type === "simple").map(toSimpleDataFromTask),
    [tasks],
  );
  const matrixRows = useMemo(
    () => [
      ...habits.map(h => ({
        id: h.id,
        title: h.title,
        week: h.history.map(val =>
          h.planner_type === "metric" ? val >= (h.planner_target ?? 1) : val > 0
        ),
      })),
      ...tasks.map(t => ({
        id: -t.id, // negative to avoid collision with habit ids in the matrix key
        title: t.title,
        week: t.history.map(val =>
          t.planner_type === "metric" ? val >= (t.planner_target ?? 1) : val > 0
        ),
      })),
    ],
    [habits, tasks],
  );

  const priorityRank: Record<string, number> = { highest: 0, high: 1, medium: 2, low: 3, lowest: 4 };
  const trackedHabitIds = useMemo(() => new Set(habits.map(h => h.id)), [habits]);
  const trackedTaskIds = useMemo(() => new Set(tasks.map(t => t.id)), [tasks]);

  const panelHabits = useMemo(() =>
    allHabits
      .map(h => ({
        id: h.id,
        title: h.title,
        type: h.planner_type === "metric" ? ("Metric" as const) : ("Simple" as const),
        priority: h.priority,
        category: h.category ?? null,
        active: trackedHabitIds.has(h.id),
      }))
      .sort((a, b) => (priorityRank[a.priority] ?? 99) - (priorityRank[b.priority] ?? 99)),
    [allHabits, trackedHabitIds],
  );

  const panelTasks = useMemo(() =>
    allTasks
      .map(t => ({
        id: t.id,
        title: t.title,
        type: t.planner_type === "metric" ? ("Metric" as const) : ("Simple" as const),
        priority: t.priority,
        active: trackedTaskIds.has(t.id),
      }))
      .sort((a, b) => (priorityRank[a.priority] ?? 99) - (priorityRank[b.priority] ?? 99)),
    [allTasks, trackedTaskIds],
  );

  const isEmpty = loadState === "loaded" && habits.length === 0 && tasks.length === 0;

  const pageHeader = (
    <PageHeader
      title="Track Progress"
      subtitle="Log what moves you forward. Seeing the numbers keeps you aligned."
      actions={[{ key: "add", label: "Track Habit", icon: <PlusLg size={14} />, tone: "soft", onClick: openPanel }]}
    />
  );

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loadState === "loading") {
    return (
      <div className="tp-page">
        {pageHeader}
        <GhostShell
          icon={<span className="tp-loading-spinner" />}
          title="Loading your habits…"
          subtitle="Fetching your progress data, just a moment."
        />
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────

  if (loadState === "error") {
    return (
      <div className="tp-page">
        {pageHeader}
        <GhostShell
          icon={<ExclamationCircle size={20} />}
          title="Couldn't load habits"
          subtitle="Something went wrong. Check your connection and try again."
          cta={{ label: "Retry", onClick: fetchTrackData }}
        />
      </div>
    );
  }

  // ── Loaded ─────────────────────────────────────────────────────────────────

  return (
    <div className="tp-page">

      {panelOpen && (
        <TrackHabitPanel
          habits={panelHabits}
          tasks={panelTasks}
          onClose={() => setPanelOpen(false)}
          onSave={handlePanelSave}
        />
      )}

      {pageHeader}

      {isEmpty ? (
        <GhostShell
          icon={<GraphUp size={20} />}
          title="No habits tracked yet"
          subtitle="Add your first habit to start building streaks and seeing your progress over time."
          cta={{ label: <><PlusLg size={12} className="me-1" />Track your first habit</>, onClick: openPanel }}
        />
      ) : (
        <>
          <section className="tp-section">
            <div className="tp-section-head">
              <h2 className="tp-section-title">This Week</h2>
              <span className="tp-section-chip">{WEEK_RANGE}</span>
            </div>
            <div className="tp-matrix-shell">
              <WeeklyMatrix rows={matrixRows} />
            </div>
          </section>

          {(metricHabits.length > 0 || metricTasks.length > 0) && (
            <section className="tp-section mt-4">
              <div className="tp-section-head">
                <h2 className="tp-section-title">Metric Tracking</h2>
                <span className="tp-section-chip">{metricHabits.length + metricTasks.length}</span>
              </div>
              <div className="tp-cards-grid">
                {metricHabits.map(h => <MetricHabitCard key={`h-${h.id}`} habit={h} />)}
                {metricTasks.map(t => <MetricHabitCard key={`t-${t.id}`} habit={t} />)}
              </div>
            </section>
          )}

          {(simpleHabits.length > 0 || simpleTasks.length > 0) && (
            <section className="tp-section mt-4">
              <div className="tp-section-head">
                <h2 className="tp-section-title">Streaks</h2>
                <span className="tp-section-chip">{simpleHabits.length + simpleTasks.length}</span>
              </div>
              <div className="tp-cards-grid">
                {simpleHabits.map(h => <SimpleHabitCard key={`h-${h.id}`} habit={h} />)}
                {simpleTasks.map(t => <SimpleHabitCard key={`t-${t.id}`} habit={t} />)}
              </div>
            </section>
          )}
        </>
      )}

    </div>
  );
}
