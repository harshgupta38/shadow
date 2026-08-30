import { useState } from "react";
import { GraphUp, PlusLg } from "react-bootstrap-icons";
import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import { MetricHabitCard } from "./MetricHabitCard/MetricHabitCard";
import { SimpleHabitCard } from "./SimpleHabitCard/SimpleHabitCard";
import { TrackHabitPanel } from "./TrackHabitPanel/TrackHabitPanel";
import type { MetricHabitData, SimpleHabitData } from "./trackProgress.types";
import "@/pages/track_progress/TrackProgressPage.scss";

// ── Mock Data ─────────────────────────────────────────────────────────────────

const MOCK_METRIC: MetricHabitData[] = [
  {
    id: 1,
    title: "Morning Run",
    value_unit: "km",
    planner_target: 5,
    current_streak: 12,
    max_streak: 18,
    category: "Fitness",
    history: [4.2, 5.1, 0, 4.8, 5.0, 3.5, 4.2, 5.2, 4.9, 5.0, 4.7, 0, 5.1, 4.3, 4.8, 5.0, 4.6, 0, 5.2, 4.8, 4.9, 5.1, 4.4, 5.0, 4.7, 4.9, 5.0, 4.8],
    color: "success",
  },
  {
    id: 2,
    title: "Deep Work",
    value_unit: "hrs",
    planner_target: 4,
    current_streak: 7,
    max_streak: 21,
    category: "Productivity",
    history: [3.5, 4.0, 2.5, 4.2, 0, 3.8, 4.1, 4.5, 3.9, 4.2, 4.0, 3.5, 4.3, 4.0, 3.8, 4.1, 0, 4.3, 4.2, 3.9, 4.0, 4.2, 3.8, 4.1, 4.0, 3.9, 4.3, 3.2],
    color: "info",
  },
  {
    id: 3,
    title: "Water Intake",
    value_unit: "L",
    planner_target: 3,
    current_streak: 21,
    max_streak: 21,
    category: "Health",
    history: [2.8, 3.2, 3.1, 2.5, 3.0, 3.4, 3.2, 3.1, 2.9, 3.0, 3.3, 3.5, 2.7, 3.0, 3.2, 3.1, 3.4, 3.0, 3.3, 2.9, 3.1, 3.2, 3.0, 3.4, 3.1, 3.2, 3.0, 2.1],
    color: "brand",
  },
  {
    id: 4,
    title: "LeetCode",
    value_unit: "problems",
    planner_target: 3,
    current_streak: 5,
    max_streak: 14,
    category: "Career",
    history: [3, 2, 3, 0, 3, 3, 1, 3, 2, 3, 3, 0, 3, 2, 3, 1, 3, 3, 2, 0, 3, 3, 2, 3, 0, 3, 2, 1],
    color: "warn",
  },
];

const MOCK_SIMPLE: SimpleHabitData[] = [
  {
    id: 5,
    title: "Morning Meditation",
    current_streak: 21,
    max_streak: 21,
    category: "Mindfulness",
    history: [
      true, true, false, true, true, true, true,
      true, true, true, false, true, true, true,
      true, false, true, true, true, true, true,
      true, true, true, true, true, false, true,
    ],
    done_today: true,
    color: "violet",
  },
  {
    id: 6,
    title: "Evening Journaling",
    current_streak: 8,
    max_streak: 22,
    category: "Mindfulness",
    history: [
      false, true, true, false, true, false, true,
      true, true, false, true, true, true, false,
      true, true, true, false, true, true, true,
      false, true, true, true, false, true, true,
    ],
    done_today: false,
    color: "success",
  },
  {
    id: 7,
    title: "Read 30 Minutes",
    current_streak: 14,
    max_streak: 14,
    category: "Learning",
    history: [
      true, false, true, true, true, false, true,
      true, true, true, false, true, true, true,
      true, true, false, true, true, true, true,
      true, true, true, true, true, true, true,
    ],
    done_today: true,
    color: "warn",
  },
  {
    id: 8,
    title: "No Phone Before 8AM",
    current_streak: 4,
    max_streak: 30,
    category: "Wellness",
    history: [
      true, false, false, true, true, true, false,
      true, true, false, true, false, true, true,
      false, true, true, true, false, false, true,
      true, true, false, true, true, true, true,
    ],
    done_today: true,
    color: "info",
  },
];

// ── Empty State ───────────────────────────────────────────────────────────────

const GHOST_WIDTHS = [58, 75, 50, 68, 62];

function EmptyState({ onTrack }: { onTrack: () => void }) {
  return (
    <div className="tp-empty">
      <div className="tp-empty-ghost-shell">
        <div className="tp-matrix-shell">
          <div className="tp-matrix-wrap">
            <div className="tp-matrix-row tp-matrix-row--header">
              <div className="tp-matrix-label tp-matrix-label--hdr">Habit</div>
              {DAY_LABELS.map((d, i) => (
                <div key={d} className={`tp-matrix-day-hdr${i === TODAY_COL ? " tp-matrix-day-hdr--today" : ""}`}>{d}</div>
              ))}
              <div className="tp-matrix-pct-hdr">Week</div>
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
        <div className="tp-empty-icon">
          <GraphUp size={20} />
        </div>
        <h3 className="tp-empty-title">No habits tracked yet</h3>
        <p className="tp-empty-sub">
          Add your first habit to start building streaks and seeing your progress over time.
        </p>
        <button className="btn btn-primary btn-sm" onClick={onTrack}>
          <PlusLg size={12} className="me-1" /> Track your first habit
        </button>
      </div>
    </div>
  );
}

// ── Weekly Accountability Matrix ──────────────────────────────────────────────

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TODAY_COL = 0; // today is Sunday (2026-08-30)

interface MatrixRow {
  id: number;
  title: string;
  week: boolean[]; // [Sun, Mon, Tue, Wed, Thu, Fri, Sat]
}

function rotateToSunFirst(w: boolean[]): boolean[] {
  return [w[6], ...w.slice(0, 6)];
}

const MATRIX_ROWS: MatrixRow[] = [
  ...MOCK_METRIC.map(h => ({
    id: h.id,
    title: h.title,
    week: rotateToSunFirst(h.history.slice(-7).map(v => v >= h.planner_target)),
  })),
  ...MOCK_SIMPLE.map(h => ({
    id: h.id,
    title: h.title,
    week: rotateToSunFirst([...h.history.slice(-6), h.done_today]),
  })),
];

function WeeklyMatrix() {
  return (
    <div className="tp-matrix-wrap">
      <div className="tp-matrix-row tp-matrix-row--header">
        <div className="tp-matrix-label tp-matrix-label--hdr">Habit</div>
        {DAY_LABELS.map((d, i) => (
          <div
            key={d}
            className={`tp-matrix-day-hdr${i === TODAY_COL ? " tp-matrix-day-hdr--today" : ""}`}
          >
            {d}
          </div>
        ))}
        <div className="tp-matrix-pct-hdr">Week</div>
      </div>

      {MATRIX_ROWS.map(r => {
        const pct = Math.round((r.week.filter(Boolean).length / 7) * 100);
        return (
          <div key={r.id} className="tp-matrix-row">
            <div className="tp-matrix-label">
              <span className="tp-matrix-habit-name">{r.title}</span>
            </div>
            {r.week.map((done, i) => (
              <div
                key={i}
                className={`tp-matrix-cell${done ? " tp-matrix-cell--done" : " tp-matrix-cell--miss"}${i === TODAY_COL ? " tp-matrix-cell--today" : ""}`}
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

// ── Habit list for the panel ─────────────────────────────────────────────────

const ALL_HABITS_FOR_PANEL = [
  ...MOCK_METRIC.map(h => ({ id: h.id, title: h.title, category: h.category, type: "Metric" as const })),
  ...MOCK_SIMPLE.map(h => ({ id: h.id, title: h.title, category: h.category, type: "Simple" as const })),
];

// ── Page ──────────────────────────────────────────────────────────────────────

export function TrackProgressPage() {
  const [panelOpen, setPanelOpen] = useState(false);
  const isEmpty = MOCK_METRIC.length === 0 && MOCK_SIMPLE.length === 0;

  return (
    <div className="tp-page">

      {panelOpen && (
        <TrackHabitPanel
          habits={ALL_HABITS_FOR_PANEL}
          onClose={() => setPanelOpen(false)}
        />
      )}

      <PageHeader
        title="Track Progress"
        subtitle="Log what moves you forward. Seeing the numbers keeps you aligned."
        actions={[{
          key: "add-tracking",
          label: "Track Habit",
          icon: <PlusLg size={14} />,
          tone: "soft",
          onClick: () => setPanelOpen(true),
        }]}
      />

      {isEmpty ? (
        <EmptyState onTrack={() => setPanelOpen(true)} />
      ) : (
        <>
          <section className="tp-section">
            <div className="tp-section-head">
              <h2 className="tp-section-title">This Week</h2>
              <span className="tp-section-chip">Aug 25 – 31, 2026</span>
            </div>
            <div className="tp-matrix-shell">
              <WeeklyMatrix />
            </div>
          </section>

          <section className="tp-section mt-4">
            <div className="tp-section-head">
              <h2 className="tp-section-title">Metric Habits</h2>
              <span className="tp-section-chip">{MOCK_METRIC.length} tracked</span>
            </div>
            <div className="tp-cards-grid">
              {MOCK_METRIC.map(h => <MetricHabitCard key={h.id} habit={h} />)}
            </div>
          </section>

          <section className="tp-section mt-4">
            <div className="tp-section-head">
              <h2 className="tp-section-title">Habit Streaks</h2>
              <span className="tp-section-chip">{MOCK_SIMPLE.length} tracked</span>
            </div>
            <div className="tp-cards-grid">
              {MOCK_SIMPLE.map(h => <SimpleHabitCard key={h.id} habit={h} />)}
            </div>
          </section>
        </>
      )}

    </div>
  );
}
