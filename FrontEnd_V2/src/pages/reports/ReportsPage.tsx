import { useEffect, useMemo, useRef, useState } from "react";
import { BarChartFill, ChevronLeft, ChevronRight, LightbulbFill } from "react-bootstrap-icons";

import { api } from "@/api";
import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import type { CalCell, CalDay, DayData } from "@/pages/reports/ReportsPage.constants";
import {
  buildMonthData, computeStats, DAY_LABELS, fmtKey,
  insightMsg, MONTH_NAMES, RING_CIRC, tierOf, TODAY,
} from "@/pages/reports/ReportsPage.constants";
import "@/pages/reports/ReportsPage.scss";

// ─── Component ────────────────────────────────────────────────────────────────

export function ReportsPage() {
  const [activeMonth, setActiveMonth] = useState(
    () => new Date(TODAY.getFullYear(), TODAY.getMonth(), 1),
  );
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [monthData, setMonthData] = useState<Map<string, DayData>>(() => new Map());
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const reqId = useRef(0);

  const year  = activeMonth.getFullYear();
  const month = activeMonth.getMonth();
  const canNext = activeMonth < new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);

  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true);
    setFetchError(null);
    setHoveredKey(null);
    void api.reports.getMonthly(year, month + 1)
      .then(res => { if (id === reqId.current) setMonthData(buildMonthData(year, month, res.days)); })
      .catch(() => { if (id === reqId.current) setFetchError("Couldn't load report data."); })
      .finally(() => { if (id === reqId.current) setLoading(false); });
  }, [year, month]);

  const stats = useMemo(() => computeStats(monthData, year, month), [monthData, year, month]);

  const cells = useMemo<CalCell[]>(() => {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDow    = new Date(year, month, 1).getDay();
    const out: CalCell[] = [];

    for (let i = 0; i < firstDow; i++) out.push({ type: "filler" });

    for (let d = 1; d <= daysInMonth; d++) {
      const date     = new Date(year, month, d);
      const key      = fmtKey(year, month, d);
      const isFuture = date > TODAY;
      const isToday  = date.toDateString() === TODAY.toDateString();
      out.push({ type: "day", date, key, data: monthData.get(key) ?? { score: null, habitsTotal: 0, habitsDone: 0, tasksTotal: 0, tasksDone: 0 }, isToday, isFuture });
    }
    return out;
  }, [year, month, monthData]);

  const hoveredCell = hoveredKey
    ? (cells.find(c => c.type === "day" && c.key === hoveredKey) as CalDay | undefined) ?? null
    : null;

  function goPrev() { setActiveMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1)); setHoveredKey(null); }
  function goNext() { if (!canNext) return; setActiveMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1)); setHoveredKey(null); }

  return (
    <section className="rp-page">

      <PageHeader
        icon={<BarChartFill size={20} />}
        title="Reports"
        subtitle="Your month at a glance — see where you thrived and where you can grow."
      />

      {/* ── Stats ──────────────────────────────────────────────────────── */}
      <div className="rp-stats">
        <div className="rp-stat rp-stat--success">
          <span className="rp-stat-val">{stats.goodDays}</span>
          <span className="rp-stat-name">Good Days</span>
          <span className="rp-stat-hint">score ≥ 60%</span>
        </div>
        <div className="rp-stat rp-stat--brand">
          <span className="rp-stat-val">{stats.avgScore}%</span>
          <span className="rp-stat-name">Avg Score</span>
          <span className="rp-stat-hint">this month's average</span>
        </div>
        <div className="rp-stat rp-stat--warn">
          <span className="rp-stat-val">{stats.bestStreak}</span>
          <span className="rp-stat-name">Best Streak</span>
          <span className="rp-stat-hint">consecutive good days</span>
        </div>
        <div className="rp-stat rp-stat--info">
          <span className="rp-stat-val">{stats.topScore > 0 ? `${stats.topScore}%` : "—"}</span>
          <span className="rp-stat-name">Top Score</span>
          <span className="rp-stat-hint">
            {stats.topDate
              ? stats.topDate.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })
              : "no data yet"}
          </span>
        </div>
      </div>

      {/* ── Calendar / Heatmap ─────────────────────────────────────────── */}
      <div className="surface rp-cal-shell mt-3">

        {/* Month nav */}
        <div className="rp-cal-panel-head">
          <button
            type="button"
            className="btn btn-ghost btn-icon border-0"
            onClick={goPrev}
            aria-label="Previous month"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="rp-month-label">
            {MONTH_NAMES[month]} {year}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-icon border-0"
            onClick={goNext}
            disabled={!canNext}
            aria-label="Next month"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Day-of-week headers */}
        <div className="rp-cal-header">
          {DAY_LABELS.map(d => (
            <div key={d} className="rp-cal-dow">{d}</div>
          ))}
        </div>

        {/* Error state */}
        {fetchError && (
          <div className="rp-cal-error">{fetchError}</div>
        )}

        {/* Grid */}
        <div className={`rp-cal-grid${loading ? " rp-cal-grid--loading" : ""}`} onMouseLeave={() => setHoveredKey(null)}>
          {cells.map((cell, i) => {
            if (cell.type === "filler") {
              return <div key={`f${i}`} className="rp-filler" />;
            }

            const { date, key, data, isToday, isFuture } = cell;
            const t   = isFuture ? "empty" : tierOf(data.score);
            const cls = [
              "rp-day",
              `rp-day--${t}`,
              isToday   ? "rp-day--today"    : "",
              isFuture  ? "rp-day--future"   : "",
              !isFuture ? "rp-day--clickable": "",
              hoveredKey === key ? "rp-day--active" : "",
            ].filter(Boolean).join(" ");

            return (
              <div
                key={key}
                className={cls}
                onMouseEnter={() => !isFuture && setHoveredKey(key)}
                onClick={() => !isFuture && console.log("TODO: open day report", key)}
                onKeyDown={!isFuture ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); console.log("TODO: open day report", key); } } : undefined}
                role={!isFuture ? "button" : undefined}
                tabIndex={!isFuture ? 0 : undefined}
                aria-label={
                  data.score !== null
                    ? `${date.toLocaleDateString("en-US", { month: "long", day: "numeric" })}, ${data.score}% completion`
                    : undefined
                }
              >
                <span className="rp-day-num">{date.getDate()}</span>

                {data.score !== null && (
                  <div className="rp-day-ring" aria-hidden="true">
                    <svg viewBox="0 0 40 40" className="rp-day-ring-svg">
                      <g transform="rotate(-90 20 20)">
                        <circle className="rp-day-ring-track" cx="20" cy="20" r="16" />
                        <circle
                          className="rp-day-ring-fill"
                          cx="20" cy="20" r="16"
                          strokeDasharray={RING_CIRC}
                          strokeDashoffset={RING_CIRC * (1 - data.score / 100)}
                        />
                      </g>
                      <text className="rp-day-ring-label" x="20" y="20">{data.score}%</text>
                    </svg>
                  </div>
                )}

              </div>
            );
          })}
        </div>

        {/* Preview strip */}
        <div className="rp-preview">
          {!hoveredCell ? (
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
