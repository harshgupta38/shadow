import { useEffect, useMemo, useState } from "react";
import { ExclamationCircle, GraphUp, PlusLg } from "react-bootstrap-icons";
import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import { useToast } from "@/context/ToastContext";
import { MetricHabitCard } from "./MetricHabitCard/MetricHabitCard";
import { SimpleHabitCard } from "./SimpleHabitCard/SimpleHabitCard";
import { TrackHabitPanel } from "./TrackHabitPanel/TrackHabitPanel";
import { trackProgressApi } from "@/api/track_progress";
import type { EligibleHabitItem, HabitTrackItem } from "@/api/types";
import { TODAY_COL, WEEK_DAY_LABELS, WEEK_RANGE, toMetricData, toSimpleData } from "./TrackProgressPage.constants";
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
  const [allHabits, setAllHabits] = useState<EligibleHabitItem[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [panelOpen, setPanelOpen] = useState(false);

  function fetchTrackData() {
    setLoadState("loading");
    trackProgressApi.getHabits()
      .then(trackData => { setHabits(trackData); setLoadState("loaded"); })
      .catch(() => setLoadState("error"));
  }

  useEffect(() => { fetchTrackData(); }, []);

  function openPanel() {
    trackProgressApi.getEligibleHabits()
      .then(allData => { setAllHabits(allData); setPanelOpen(true); })
      .catch(() => { toast.error("Could not load habits. Please try again."); });
  }


  function handlePanelSave(enabledIds: Set<number>) {
    trackProgressApi.setTracking(Array.from(enabledIds))
      .then(() => {
        setPanelOpen(false);
        Promise.all([trackProgressApi.getHabits(), trackProgressApi.getEligibleHabits()] as [Promise<HabitTrackItem[]>, Promise<EligibleHabitItem[]>])
          .then(([trackData, allData]) => { setHabits(trackData); setAllHabits(allData); })
          .catch(() => { toast.error("Tracking saved, but we could not refresh habits. Please reload."); });
      })
      .catch(() => { toast.error("Could not save tracking changes. Please try again."); });
  }

  const metricHabits = useMemo(
    () => habits.filter(h => h.planner_type === "metric").map(toMetricData),
    [habits],
  );
  const simpleHabits = useMemo(
    () => habits.filter(h => h.planner_type === "simple").map(toSimpleData),
    [habits],
  );
  const matrixRows = useMemo(
    () => habits.map(h => ({
      id: h.id,
      title: h.title,
      week: h.history.map(val =>
        h.planner_type === "metric" ? val >= (h.planner_target ?? 1) : val > 0
      ),
    })),
    [habits],
  );

  const panelHabits = useMemo(
    () => {
      const trackedIds = new Set(habits.map(h => h.id));
      const priorityRank: Record<string, number> = { highest: 0, high: 1, medium: 2, low: 3, lowest: 4 };
      return allHabits
        .map(h => ({
          id: h.id,
          title: h.title,
          type: h.planner_type === "metric" ? ("Metric" as const) : ("Simple" as const),
          priority: h.priority,
          category: h.category ?? null,
          active: trackedIds.has(h.id),
        }))
        .sort((a, b) => (priorityRank[a.priority] ?? 99) - (priorityRank[b.priority] ?? 99));
    },
    [allHabits, habits],
  );

  const isEmpty = loadState === "loaded" && habits.length === 0;

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

          {metricHabits.length > 0 && (
            <section className="tp-section mt-4">
              <div className="tp-section-head">
                <h2 className="tp-section-title">Metric Habits</h2>
                <span className="tp-section-chip">{metricHabits.length}</span>
              </div>
              <div className="tp-cards-grid">
                {metricHabits.map(h => (
                  <MetricHabitCard key={h.id} habit={h} />
                ))}
              </div>
            </section>
          )}

          {simpleHabits.length > 0 && (
            <section className="tp-section mt-4">
              <div className="tp-section-head">
                <h2 className="tp-section-title">Habit Streaks</h2>
                <span className="tp-section-chip">{simpleHabits.length}</span>
              </div>
              <div className="tp-cards-grid">
                {simpleHabits.map(h => (
                  <SimpleHabitCard key={h.id} habit={h} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

    </div>
  );
}
