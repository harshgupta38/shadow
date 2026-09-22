import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWeekStart } from "@/context/PlannerContext";
import { monthFirstDow, weekDayLabels } from "@/utils/weekUtils";
import { BarChartFill, CalendarEvent, ChevronLeft, ChevronRight, LightbulbFill, Stars } from "react-bootstrap-icons";
import { useLocation, useNavigate } from "react-router-dom";
import { api, ApiError } from "@/api";
import type { Notification } from "@/api";
import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import { ROUTES } from "@/routes/RoutePaths";
import { useMonthParam } from "@/hooks/useUrlAnchor";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { ChoiceDialog } from "@/components/ui/ChoiceDialog/ChoiceDialog";
import { useToast } from "@/context/ToastContext";
import type { ScoreTier, DayData, CalDay, CalCell } from "@/pages/reports/types";
import {
  TODAY, RING_CIRC, MONTH_NAMES,
  fmtKey, buildMonthData, tierOf, computeStats, insightMsg,
} from "@/pages/reports/ReportsPage.constants";
import { GenerateReportDialog } from "@/pages/reports/GenerateReportDialog";
import "@/pages/reports/ReportsPage.scss";

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
            {Array.from({ length: 7 }, (_, i) => <div key={i} className="rp-ghost-dow" />)}
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
  const location = useLocation();
  const toast = useToast();
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [confirmDate, setConfirmDate] = useState<string | null>(null);
  const [noDataDate, setNoDataDate] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const { year, month, setMonth } = useMonthParam();
  // Passed to the detail page so its back links return to this exact month
  // instead of always resetting to the current one.
  const returnPath = `${location.pathname}${location.search}`;
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [monthData, setMonthData] = useState<Map<string, DayData>>(() => new Map());
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const reqId = useRef(0);

  const canNext = new Date(year, month, 1) < new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);

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

  // Live-updates the calendar the moment a "report ready" notification arrives for the
  // month currently on screen — so a report generated while this page is open is
  // reflected immediately, instead of requiring a reload before it stops asking to
  // generate a report the user already generated.
  useEffect(() => {
    function onNotification(e: Event) {
      const notif = (e as CustomEvent<Notification>).detail;
      if (!notif.event_key?.startsWith("report:")) return;
      const [, , reportDateStr] = notif.event_key.split(":");
      const [reportYear, reportMonth] = reportDateStr.split("-").map(Number);
      if (reportYear === year && reportMonth - 1 === month) {
        void api.reports.getMonthly(year, month + 1)
          .then(res => setMonthData(buildMonthData(year, month, res.days)))
          .catch(() => { /* next manual refresh will pick it up */ });
      }
    }
    window.addEventListener("shadow:notification", onNotification);
    return () => window.removeEventListener("shadow:notification", onNotification);
  }, [year, month]);

  const stats = useMemo(() => computeStats(monthData, year, month), [monthData, year, month]);

  const weekStart = useWeekStart();

  const cells = useMemo<CalCell[]>(() => {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDow = monthFirstDow(year, month, weekStart);
    const out: CalCell[] = [];

    for (let i = 0; i < firstDow; i++) out.push({ type: "filler" });

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const key = fmtKey(year, month, d);
      const isFuture = date > TODAY;
      const isToday = date.toDateString() === TODAY.toDateString();
      out.push({ type: "day", date, key, data: monthData.get(key)!, isToday, isFuture });
    }
    return out;
  }, [year, month, monthData, weekStart]);

  const hoveredCell = hoveredKey
    ? (cells.find(c => c.type === "day" && c.key === hoveredKey) as CalDay | undefined) ?? null
    : null;

  function goPrev() { setMonth(month === 0 ? year - 1 : year, month === 0 ? 11 : month - 1); setHoveredKey(null); }
  function goNext() { if (!canNext) return; setMonth(month === 11 ? year + 1 : year, month === 11 ? 0 : month + 1); setHoveredKey(null); }

  async function handleGenerateForDate() {
    if (!confirmDate) return;
    setGenerating(true);
    try {
      await api.reports.generateReportRequest(confirmDate, "daily");
      setConfirmDate(null);
      toast.info("Report requested — we'll notify you when it's ready.");
      // loadReport();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to request report. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  const todayStr = fmtKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());

  const pageHeader = (
    <PageHeader
      icon={<BarChartFill size={20} />}
      title="Reports"
      subtitle="Your month at a glance — see where you thrived and where you can grow."
      actions={[
        {
          key: "generate-report",
          label: "Generate Report",
          icon: <Stars size={15} />,
          tone: "brand",
          disabled: loading,
          onClick: () => setShowGenerateDialog(true),
        },
      ]}
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

  // ── Fetch error ──────────────────────────────────────────────────────────────

  if (fetchError) {
    return (
      <section className="rp-page">
        {pageHeader}
        <div className="rp-fetch-error">
          <p className="rp-fetch-error-msg">{fetchError}</p>
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={loadReport}>
            Try again
          </button>
        </div>
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
          {weekDayLabels(weekStart).map(d => <div key={d} className="rp-cal-dow">{d}</div>)}
        </div>

        <div className="rp-cal-grid" onMouseLeave={() => setHoveredKey(null)}>
          {cells.map((cell, i) => {
            if (cell.type === "filler") return <div key={`f${i}`} className="rp-filler" />;

            const { date, key, data, isToday, isFuture } = cell;
            const displayedScore = data?.alignmentScore ?? data?.score;
            const t: ScoreTier = isFuture ? "empty" : tierOf(displayedScore);
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
                onClick={() => {
                  if (isFuture) return;
                  const reportType = data.hasDailyReport ? "daily" : data.hasWeeklyReport ? "weekly" : null;
                  if (reportType) navigate(`${ROUTES.REPORTS_DETAIL.replace(":historyDate", key)}?report_type=${reportType}`, { state: { returnPath } });
                  else if (data.score !== null) setConfirmDate(key);
                  else setNoDataDate(key);
                }}
                onKeyDown={!isFuture ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    const reportType = data.hasDailyReport ? "daily" : data.hasWeeklyReport ? "weekly" : null;
                    if (reportType) navigate(`${ROUTES.REPORTS_DETAIL.replace(":historyDate", key)}?report_type=${reportType}`, { state: { returnPath } });
                    else if (data.score !== null) setConfirmDate(key);
                    else setNoDataDate(key);
                  }
                } : undefined}
                role={!isFuture ? "button" : undefined}
                tabIndex={!isFuture ? 0 : undefined}
                aria-label={displayedScore !== null ? `${date.toLocaleDateString("en-US", { month: "long", day: "numeric" })}, ${displayedScore}% completion` : undefined}
              >
                <span className="rp-day-num">{date.getDate()}</span>
                {displayedScore !== null && (() => {
                  const displayed = displayedScore;
                  return (
                    <div className="rp-day-ring" aria-hidden="true">
                      <svg viewBox="0 0 40 40" className="rp-day-ring-svg">
                        <g transform="rotate(-90 20 20)">
                          <circle className="rp-day-ring-track" cx="20" cy="20" r="16" />
                          <circle className="rp-day-ring-fill" cx="20" cy="20" r="16" strokeDasharray={RING_CIRC} strokeDashoffset={RING_CIRC * (1 - displayed / 100)} />
                        </g>
                        <text className="rp-day-ring-label" x="20" y="20">{displayed}%</text>
                      </svg>
                    </div>
                  );
                })()}
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
              {(hoveredCell.data.alignmentScore ?? hoveredCell.data.score) !== null && (
                <>
                  <span className="rp-preview-sep" />
                  <span className={`rp-preview-score rp-preview-score--${tierOf(hoveredCell.data.alignmentScore ?? hoveredCell.data.score)}`}>
                    {hoveredCell.data.alignmentScore ?? hoveredCell.data.score}% overall
                  </span>
                </>
              )}
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

      <GenerateReportDialog
        show={showGenerateDialog}
        onHide={() => setShowGenerateDialog(false)}
        todayStr={todayStr}
      />

      <ConfirmDialog
        show={confirmDate !== null}
        title="No report for this date"
        message="There is no report generated for this date. Would you like to generate one now?"
        confirmLabel="Generate"
        busy={generating}
        onConfirm={handleGenerateForDate}
        onCancel={() => setConfirmDate(null)}
      />

      <ChoiceDialog
        show={noDataDate !== null}
        title="Nothing planned for this date"
        message="There were no tasks or habits tracked on this date, so there's no report to view."
        icon={<CalendarEvent size={26} />}
        onHide={() => setNoDataDate(null)}
        buttons={[{ label: "OK", variant: "brand", onClick: () => setNoDataDate(null) }]}
      />

    </section>
  );
}
