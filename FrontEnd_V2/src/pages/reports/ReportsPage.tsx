import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChartFill, ChevronLeft, ChevronRight, LightbulbFill } from "react-bootstrap-icons";
import { useNavigate } from "react-router-dom";

import { api } from "@/api";
import type { DayReport } from "@/api/types";
import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import { todayDate } from "@/services/date.service";
import { ROUTES } from "@/routes/RoutePaths";
import "@/pages/reports/ReportsPage.scss";

// ─── Constants ─────────────────────────────────────────────────────────────────

const TODAY = todayDate();

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const RING_CIRC = 2 * Math.PI * 16;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ─── Types ─────────────────────────────────────────────────────────────────────

type ScoreTier = "empty" | "poor" | "low" | "mid" | "good" | "great";

interface DayMock {
  score: number | null;
  habitsTotal: number;
  habitsDone: number;
  tasksTotal: number;
  tasksDone: number;
  scheduleTotal: number;
  scheduleDone: number;
}

interface CalDay {
  type: "day";
  date: Date;
  key: string;
  data: DayMock;
  isToday: boolean;
  isFuture: boolean;
}

interface CalFiller { type: "filler"; }

type CalCell = CalDay | CalFiller;

interface Stats {
  goodDays: number;
  tracked: number;
  avgScore: number;
  bestStreak: number;
  topScore: number;
  topDate: Date | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtKey(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function buildMonthData(year: number, month: number, apiDays: DayReport[]): Map<string, DayMock> {
  const out = new Map<string, DayMock>();
  const lookup = new Map(apiDays.map(d => [d.date, d]));
  const totalDays = new Date(year, month + 1, 0).getDate();

  for (let d = 1; d <= totalDays; d++) {
    const key = fmtKey(year, month, d);
    const src = lookup.get(key);
    out.set(key, src
      ? {
        score: src.score,
        habitsTotal: src.habits_total,
        habitsDone: src.habits_done,
        tasksTotal: src.tasks_total,
        tasksDone: src.tasks_done,
        scheduleTotal: src.schedule_total,
        scheduleDone: src.schedule_done,
      }
      : { score: null, habitsTotal: 0, habitsDone: 0, tasksTotal: 0, tasksDone: 0, scheduleTotal: 0, scheduleDone: 0 },
    );
  }
  return out;
}

function tierOf(score: number | null): ScoreTier {
  if (score === null || score <= 0) return "empty";
  if (score <= 20) return "poor";
  if (score <= 40) return "low";
  if (score <= 60) return "mid";
  if (score <= 80) return "good";
  return "great";
}

function computeStats(data: Map<string, DayMock>, year: number, month: number): Stats {
  const days = new Date(year, month + 1, 0).getDate();
  let goodDays = 0, tracked = 0, totalScore = 0;
  let streak = 0, best = 0, topScore = 0, topDay = 0;

  for (let d = 1; d <= days; d++) {
    const entry = data.get(fmtKey(year, month, d));
    if (!entry || entry.score === null) { streak = 0; continue; }
    tracked++;
    totalScore += entry.score;
    if (entry.score > topScore) { topScore = entry.score; topDay = d; }
    if (entry.score >= 60) { best = Math.max(best, ++streak); goodDays++; }
    else streak = 0;
  }

  return {
    goodDays, tracked,
    avgScore: tracked > 0 ? Math.round(totalScore / tracked) : 0,
    bestStreak: best,
    topScore,
    topDate: topDay > 0 ? new Date(year, month, topDay) : null,
  };
}

function insightMsg(stats: Stats, month: number, year: number): string {
  const name = MONTH_NAMES[month];
  if (stats.tracked === 0) return `No data yet for ${name} ${year}. Navigate to a past month to see your performance summary.`;
  if (stats.bestStreak >= 7) return `A ${stats.bestStreak}-day streak in ${name} — that kind of sustained effort is where real change happens.`;
  if (stats.goodDays >= stats.tracked * 0.75) return `${stats.goodDays} of ${stats.tracked} tracked days were strong. ${name} is one of your most consistent months.`;
  if (stats.goodDays >= stats.tracked * 0.5) return `More than half of ${name} has been productive. A few more consistent days will make this a standout month.`;
  return `Every tracked day adds up. Use ${name}'s patterns to spot where consistency slips — that's your growth edge.`;
}

// ─── Ghost Shell ──────────────────────────────────────────────────────────────

function ReportGhostShell() {
  return (
    <div className="rp-ghost-wrap">
      <div className="rp-ghost-shell" aria-hidden="true">

        {/* Ghost stat cards */}
        <div className="rp-ghost-stats">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="rp-ghost-stat">
              <div className="rp-ghost-val" />
              <div className="rp-ghost-text">
                <div className="rp-ghost-name" />
                <div className="rp-ghost-hint" />
              </div>
            </div>
          ))}
        </div>

        {/* Ghost calendar — 2 rows only so loading text stays high */}
        <div className="surface rp-ghost-cal mt-3">
          <div className="rp-ghost-cal-head">
            <div className="rp-ghost-nav-btn" />
            <div className="rp-ghost-month-lbl" />
            <div className="rp-ghost-nav-btn" />
          </div>
          <div className="rp-ghost-cal-dow">
            {DAY_LABELS.map(d => <div key={d} className="rp-ghost-dow" />)}
          </div>
          <div className="rp-ghost-cal-grid">
            {Array.from({ length: 14 }, (_, i) => <div key={i} className="rp-ghost-cell" />)}
          </div>
        </div>

      </div>

      <div className="rp-ghost-core">
        <div className="rp-ghost-icon">
          <span className="rp-ghost-spinner" />
        </div>
        <h3 className="rp-ghost-title">Loading your report…</h3>
        <p className="rp-ghost-sub">Fetching your monthly data, just a moment.</p>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ReportsPage() {
  const navigate = useNavigate();
  const [activeMonth, setActiveMonth] = useState(
    () => new Date(TODAY.getFullYear(), TODAY.getMonth(), 1),
  );
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [monthData, setMonthData] = useState<Map<string, DayMock>>(() => new Map());
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const reqId = useRef(0);

  const year = activeMonth.getFullYear();
  const month = activeMonth.getMonth();
  const canNext = activeMonth < new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);

  const loadReport = useCallback(() => {
    const id = ++reqId.current;
    setLoading(true);
    setFetchError(null);
    setHoveredKey(null);
    void api.reports.getMonthly(year, month + 1)
      .then(res => { if (id === reqId.current) setMonthData(buildMonthData(year, month, res.days)); })
      .catch(() => { if (id === reqId.current) setFetchError("Couldn't load report data."); })
      .finally(() => { if (id === reqId.current) setLoading(false); });
  }, [year, month]);

  useEffect(() => { loadReport(); }, [loadReport]);

  const stats = useMemo(() => computeStats(monthData, year, month), [monthData, year, month]);

  const cells = useMemo<CalCell[]>(() => {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDow = new Date(year, month, 1).getDay();
    const out: CalCell[] = [];

    for (let i = 0; i < firstDow; i++) out.push({ type: "filler" });

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const key = fmtKey(year, month, d);
      const isFuture = date > TODAY;
      const isToday = date.toDateString() === TODAY.toDateString();
      out.push({ type: "day", date, key, data: monthData.get(key) ?? { score: null, habitsTotal: 0, habitsDone: 0, tasksTotal: 0, tasksDone: 0, scheduleTotal: 0, scheduleDone: 0 }, isToday, isFuture });
    }
    return out;
  }, [year, month, monthData]);

  const hoveredCell = hoveredKey
    ? (cells.find(c => c.type === "day" && c.key === hoveredKey) as CalDay | undefined) ?? null
    : null;

  function goPrev() { setActiveMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1)); setHoveredKey(null); }
  function goNext() { if (!canNext) return; setActiveMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1)); setHoveredKey(null); }

  const pageHeader = (
    <PageHeader
      icon={<BarChartFill size={20} />}
      title="Reports"
      subtitle="Your month at a glance — see where you thrived and where you can grow."
    />
  );

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <section className="rp-page">
        {pageHeader}
        <ReportGhostShell />
      </section>
    );
  }

  // ── Loaded ───────────────────────────────────────────────────────────────────

  return (
    <section className="rp-page">

      {pageHeader}

      {/* ── Stats ──────────────────────────────────────────────────────── */}
      <div className="rp-stats">
        <div className="rp-stat rp-stat--success">
          <span className="rp-stat-val">{stats.goodDays}</span>
          <div className="rp-stat-text">
            <span className="rp-stat-name">Good Days</span>
            <span className="rp-stat-hint">score ≥ 60%</span>
          </div>
        </div>
        <div className="rp-stat rp-stat--brand">
          <span className="rp-stat-val">{stats.avgScore}%</span>
          <div className="rp-stat-text">
            <span className="rp-stat-name">Avg Score</span>
            <span className="rp-stat-hint">this month's average</span>
          </div>
        </div>
        <div className="rp-stat rp-stat--warn">
          <span className="rp-stat-val">{stats.bestStreak}</span>
          <div className="rp-stat-text">
            <span className="rp-stat-name">Best Streak</span>
            <span className="rp-stat-hint">consecutive good days</span>
          </div>
        </div>
        <div className="rp-stat rp-stat--info">
          <span className="rp-stat-val">{stats.topScore > 0 ? `${stats.topScore}%` : "—"}</span>
          <div className="rp-stat-text">
            <span className="rp-stat-name">Top Score</span>
            <span className="rp-stat-hint">
              {stats.topDate
                ? stats.topDate.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })
                : "no data yet"}
            </span>
          </div>
        </div>
      </div>

      {/* ── Calendar / Heatmap ─────────────────────────────────────────── */}
      <div className="surface rp-cal-shell mt-3">

        <div className="rp-cal-panel-head">
          <button type="button" className="btn btn-ghost btn-icon border-0" onClick={goPrev} aria-label="Previous month">
            <ChevronLeft size={16} />
          </button>
          <span className="rp-month-label">{MONTH_NAMES[month]} {year}</span>
          <button type="button" className="btn btn-ghost btn-icon border-0" onClick={goNext} disabled={!canNext} aria-label="Next month">
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="rp-cal-header">
          {DAY_LABELS.map(d => <div key={d} className="rp-cal-dow">{d}</div>)}
        </div>

        <div className="rp-cal-grid" onMouseLeave={() => setHoveredKey(null)}>
          {cells.map((cell, i) => {
            if (cell.type === "filler") return <div key={`f${i}`} className="rp-filler" />;

            const { date, key, data, isToday, isFuture } = cell;
            const t = isFuture ? ("empty" as ScoreTier) : tierOf(data.score);
            const cls = [
              "rp-day", `rp-day--${t}`,
              isToday ? "rp-day--today" : "",
              isFuture ? "rp-day--future" : "",
              !isFuture ? "rp-day--clickable" : "",
              hoveredKey === key ? "rp-day--active" : "",
            ].filter(Boolean).join(" ");

            return (
              <div
                key={key}
                className={cls}
                onMouseEnter={() => !isFuture && setHoveredKey(key)}
                onClick={() => !isFuture && navigate(ROUTES.REPORTS_DETAIL.replace(":historyDate", key))}
                onKeyDown={!isFuture ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(ROUTES.REPORTS_DETAIL.replace(":historyDate", key)); } } : undefined}
                role={!isFuture ? "button" : undefined}
                tabIndex={!isFuture ? 0 : undefined}
                aria-label={data.score !== null ? `${date.toLocaleDateString("en-US", { month: "long", day: "numeric" })}, ${data.score}% completion` : undefined}
              >
                <span className="rp-day-num">{date.getDate()}</span>
                {data.score !== null && (
                  <div className="rp-day-ring" aria-hidden="true">
                    <svg viewBox="0 0 40 40" className="rp-day-ring-svg">
                      <g transform="rotate(-90 20 20)">
                        <circle className="rp-day-ring-track" cx="20" cy="20" r="16" />
                        <circle className="rp-day-ring-fill" cx="20" cy="20" r="16" strokeDasharray={RING_CIRC} strokeDashoffset={RING_CIRC * (1 - data.score / 100)} />
                      </g>
                      <text className="rp-day-ring-label" x="20" y="20">{data.score}%</text>
                    </svg>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="rp-preview">
          {fetchError ? (
            <span className="rp-preview-error">
              {fetchError} Please{" "}
              <button type="button" className="btn-link-inline" onClick={loadReport}>try again</button>.
            </span>
          ) : !hoveredCell ? (
            <span className="rp-preview-idle">Hover over a day to preview</span>
          ) : (
            <>
              <span className="rp-preview-date">
                {hoveredCell.date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </span>
              <span className="rp-preview-sep" />
              <span className={`rp-preview-score rp-preview-score--${tierOf(hoveredCell.data.score)}`}>
                {hoveredCell.data.score}% overall
              </span>
              <span className="rp-preview-sep" />
              <span className="rp-preview-detail">{hoveredCell.data.habitsDone}/{hoveredCell.data.habitsTotal} habits</span>
              <span className="rp-preview-sep" />
              <span className="rp-preview-detail">{hoveredCell.data.tasksDone}/{hoveredCell.data.tasksTotal} tasks</span>
              <span className="rp-preview-sep" />
              <span className="rp-preview-detail">{hoveredCell.data.scheduleDone}/{hoveredCell.data.scheduleTotal} scheduled</span>
            </>
          )}
        </div>
      </div>

      {/* ── AI Insight ─────────────────────────────────────────────────── */}
      <div className="rp-insight mt-3">
        <span className="rp-insight-icon"><LightbulbFill size={14} /></span>
        <p className="rp-insight-body">{insightMsg(stats, month, year)}</p>
      </div>

    </section>
  );
}
