import { useState } from "react";
import { useDateFormat, useWeekStart } from "@/context/PlannerContext";
import { weekDayLabels } from "@/utils/weekUtils";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircleFill, ExclamationTriangleFill } from "react-bootstrap-icons";

import { api, ApiError } from "@/api";
import type { DailyReportDetail, DayReport } from "@/api";
import { ROUTES } from "@/routes/RoutePaths";
import { useToast } from "@/context/ToastContext";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { formatDisplayDate, todayDate } from "@/services/date.service";
import { CLOSING_EMOJI } from "@/pages/reports/ReportDetailPage/ReportDetailPage.constants";
import { buildCalCells, ringColor, type CalCell } from "./ReportsOverview.constants";
import "./ReportsOverview.scss";

interface Props {
  monthDays: DayReport[];
  latestReport: DailyReportDetail | null;
}

const CAL_RING_R = 13;
const CAL_RING_CIRC = 2 * Math.PI * CAL_RING_R;

// Score-tinted ring — mirrors AlignmentRing in ReportDetailPage, kept local since
// it's a tiny page-specific piece (the app has no shared ring with dynamic color).
function ReportRing({ pct, size = 96, stroke = 9 }: { pct: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct / 100);
  const color = ringColor(pct);

  return (
    <div className="dp-report-ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="color-mix(in srgb, var(--jv-border) 88%, transparent)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="dp-report-ring-label">
        <span className="dp-report-ring-pct" style={{ color }}>{pct}%</span>
        <span className="dp-report-ring-sub">Aligned</span>
      </div>
    </div>
  );
}

export function ReportsOverview({ monthDays, latestReport }: Props) {
  const navigate = useNavigate();
  const toast = useToast();
  const weekStart = useWeekStart();
  const dateFormat = useDateFormat();
  const [confirmDate, setConfirmDate] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  // No report has ever been generated — nothing meaningful to show yet.
  if (!latestReport) return null;

  const today = todayDate();
  const calCells = buildCalCells(monthDays, today.getFullYear(), today.getMonth(), today, weekStart);
  const reportHref = `${ROUTES.REPORTS_DETAIL.replace(":historyDate", latestReport.date)}?report_type=${latestReport.report_type}`;

  function handleCalCellClick(cell: CalCell) {
    if (cell.tier === "filler" || cell.isFuture) return;
    const reportType = cell.hasDailyReport ? "daily" : cell.hasWeeklyReport ? "weekly" : null;
    if (reportType) {
      navigate(`${ROUTES.REPORTS_DETAIL.replace(":historyDate", cell.key)}?report_type=${reportType}`);
    } else {
      setConfirmDate(cell.key);
    }
  }

  async function handleGenerateForDate() {
    if (!confirmDate) return;
    setGenerating(true);
    try {
      await api.reports.generateReportRequest(confirmDate, "daily");
      setConfirmDate(null);
      toast.info("Report requested — we'll notify you when it's ready.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to request report. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="dp-section">
      <div className="dp-section-head">
        <h2 className="dp-section-title">Reports Overview</h2>
        <Link to={ROUTES.REPORTS} className="dp-section-link">View reports →</Link>
      </div>

      <div className="dp-reports-grid">
        <div className="dp-cal-card">
          <div className="dp-cal-head">
            {today.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </div>
          <div className="dp-cal-dow-row">
            {weekDayLabels(weekStart).map((d) => <span key={d} className="dp-cal-dow">{d}</span>)}
          </div>
          <div className="dp-cal-grid">
            {calCells.map((cell) => {
              if (cell.tier === "filler") return <div key={cell.key} className="dp-cal-filler" />;
              const isClickable = !cell.isFuture;
              return (
                <div
                  key={cell.key}
                  className={[
                    "dp-cal-cell", `dp-cal-cell--${cell.tier}`,
                    cell.isToday && "dp-cal-cell--today",
                    cell.isFuture && "dp-cal-cell--future",
                    isClickable && "dp-cal-cell--clickable",
                  ].filter(Boolean).join(" ")}
                  role={isClickable ? "button" : undefined}
                  tabIndex={isClickable ? 0 : undefined}
                  onClick={isClickable ? () => handleCalCellClick(cell) : undefined}
                  onKeyDown={isClickable ? (e) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleCalCellClick(cell); }
                  } : undefined}
                >
                  <span className="dp-cal-cell-num">{Number(cell.key.slice(-2))}</span>
                  {cell.score !== null && (
                    <svg viewBox="0 0 32 32" className="dp-cal-ring-svg">
                      <g transform="rotate(-90 16 16)">
                        <circle className="dp-cal-ring-track" cx="16" cy="16" r={CAL_RING_R} />
                        <circle
                          className="dp-cal-ring-fill" cx="16" cy="16" r={CAL_RING_R}
                          strokeDasharray={CAL_RING_CIRC}
                          strokeDashoffset={CAL_RING_CIRC * (1 - cell.score / 100)}
                        />
                      </g>
                    </svg>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="dp-report-col">
          <Link to={reportHref} className="dp-report-hero">
            <ReportRing pct={latestReport.alignment_score} />
            <div className="dp-report-body">
              <span className="dp-report-date">
                {formatDisplayDate(latestReport.date, dateFormat)} · {latestReport.report_type === "weekly" ? "Weekly" : "Daily"} Report
              </span>
              <h3 className="dp-report-headline">{latestReport.headline}</h3>
              <p className="dp-report-summary">{latestReport.summary}</p>
              <span className="dp-report-cta">View full report →</span>
            </div>
          </Link>

          <div className="dp-report-highlights">
            {latestReport.highlights.good[0] && (
              <div className="dp-report-highlight dp-report-highlight--good">
                <span className="dp-report-highlight-label"><CheckCircleFill size={11} /> Went well</span>
                <p className="dp-report-highlight-text">{latestReport.highlights.good[0]}</p>
              </div>
            )}
            {latestReport.highlights.attention[0] && (
              <div className="dp-report-highlight dp-report-highlight--attention">
                <span className="dp-report-highlight-label"><ExclamationTriangleFill size={11} /> Needs attention</span>
                <p className="dp-report-highlight-text">{latestReport.highlights.attention[0]}</p>
              </div>
            )}
          </div>

          <div className="dp-report-closing">
            <span className="dp-report-closing-icon" aria-hidden="true">{CLOSING_EMOJI[latestReport.closing.tone]}</span>
            <p className="dp-report-closing-msg">{latestReport.closing.message}</p>
          </div>
        </div>
      </div>

      <ConfirmDialog
        show={confirmDate !== null}
        title="No report for this date"
        message={confirmDate ? `No report was generated for ${formatDisplayDate(confirmDate, dateFormat)}. Would you like to generate one now?` : ""}
        confirmLabel="Generate"
        busy={generating}
        onConfirm={handleGenerateForDate}
        onCancel={() => setConfirmDate(null)}
      />
    </div>
  );
}
