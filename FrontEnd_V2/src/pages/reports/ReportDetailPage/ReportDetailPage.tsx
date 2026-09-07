import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  BarChartFill,
  CheckCircleFill,
  ChevronLeft,
  ChevronRight,
  ExclamationTriangleFill,
  FileEarmarkBarGraphFill,
} from "react-bootstrap-icons";

import { api, ApiError } from "@/api";
import { ROUTES } from "@/routes/RoutePaths";
import type { DailyReportDetail, GoalAlignment } from "@/api/types";
import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import { CLOSING_EMOJI, fmtTime, ringColor } from "./ReportDetailPage.constants";
import "./ReportDetailPage.scss";

// ── Progress Ring ─────────────────────────────────────────────────────────────

function AlignmentRing({ pct, size = 148, stroke = 12 }: { pct: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct / 100);
  const color = ringColor(pct);

  return (
    <div className="rdp-ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="rdp-ring-svg">
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke="color-mix(in srgb, var(--jv-border) 88%, transparent)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="rdp-ring-fill"
        />
      </svg>
      <div className="rdp-ring-label">
        <span className="rdp-ring-pct" style={{ color }}>{pct}%</span>
        <span className="rdp-ring-sub">Aligned</span>
      </div>
    </div>
  );
}

// ── Goal Card ─────────────────────────────────────────────────────────────────

function GoalCard({ goal }: { goal: GoalAlignment }) {
  const SIZE = 58;
  const STROKE = 5;
  const r = (SIZE - STROKE) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - goal.alignment_pct / 100);
  const color = ringColor(goal.alignment_pct);
  const barPct = goal.tasks_total > 0 ? (goal.tasks_done / goal.tasks_total) * 100 : 0;

  return (
    <div className="rdp-goal-card">
      <div className="rdp-goal-card-top">
        <div className="rdp-goal-mini-ring" style={{ width: SIZE, height: SIZE }}>
          <svg width={SIZE} height={SIZE}>
            <circle cx={SIZE / 2} cy={SIZE / 2} r={r} fill="none" stroke="color-mix(in srgb, var(--jv-border) 88%, transparent)" strokeWidth={STROKE} />
            <circle
              cx={SIZE / 2} cy={SIZE / 2} r={r}
              fill="none"
              stroke={color}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={offset}
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            />
          </svg>
          <span className="rdp-mini-pct">{goal.alignment_pct}%</span>
        </div>
        <div className="rdp-goal-meta">
          <span className="rdp-goal-title">{goal.title}</span>
          <span className="rdp-goal-milestone">{goal.milestone_title}</span>
        </div>
      </div>
      <p className="rdp-goal-note">{goal.note}</p>
      <div className="rdp-goal-footer">
        <span className="rdp-goal-tasks">{goal.tasks_done} / {goal.tasks_total} tasks</span>
        <div className="rdp-goal-bar">
          <div className="rdp-goal-bar-fill" style={{ width: `${barPct}%`, background: color }} />
        </div>
      </div>
    </div>
  );
}

// ── Ghost Shell ───────────────────────────────────────────────────────────────

function RdpGhostShell() {
  return (
    <div className="rdp-ghost-wrap">
      <div className="rdp-ghost-shell" aria-hidden="true">

        {/* Ghost hero */}
        <div className="rdp-ghost-hero">
          <div className="rdp-ghost-ring" />
          <div className="rdp-ghost-hero-text">
            <div className="rdp-ghost-headline" />
            <div className="rdp-ghost-headline rdp-ghost-headline--short" />
            <div className="rdp-ghost-summary" />
            <div className="rdp-ghost-summary rdp-ghost-summary--med" />
          </div>
        </div>

        {/* Ghost stats */}
        <div className="rdp-ghost-stats mt-3">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="rdp-ghost-stat">
              <div className="rdp-ghost-stat-val" />
              <div className="rdp-ghost-stat-text">
                <div className="rdp-ghost-stat-name" />
                <div className="rdp-ghost-stat-hint" />
              </div>
            </div>
          ))}
        </div>

      </div>

      <div className="rdp-ghost-core">
        <div className="rdp-ghost-icon-wrap">
          <span className="rdp-ghost-spinner" />
        </div>
        <h3 className="rdp-ghost-title">Loading your report…</h3>
        <p className="rdp-ghost-sub">Fetching your report data, just a moment.</p>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function ReportDetailPage() {
  const navigate = useNavigate();
  const { historyDate } = useParams<{ historyDate: string }>();
  const [searchParams] = useSearchParams();
  const reportType = (searchParams.get("report_type") ?? "daily") as "daily" | "weekly";

  const [reports, setReports] = useState<DailyReportDetail[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pageTitle = reportType === "weekly" ? "Weekly Report" : "Daily Report";

  useEffect(() => {
    if (!historyDate) return;
    setLoading(true);
    setError(null);
    api.reports.getReports(historyDate, reportType)
      .then(data => { setReports(data); setIdx(0); })
      .catch((error) => setError(error instanceof ApiError ? error.message : "Report not found. It may still be generating — check back in a moment."))
      .finally(() => setLoading(false));
  }, [historyDate, reportType]);

  if (loading) {
    return (
      <div className="rdp-page">
        <button type="button" className="rdp-back-link" onClick={() => navigate(ROUTES.REPORTS)}>
          <ArrowLeft size={16} /> Back
        </button>
        <PageHeader icon={<BarChartFill size={20} />} title={pageTitle} subtitle={historyDate ?? "Loading…"} actions={[]} />
        <RdpGhostShell />
      </div>
    );
  }

  if (error || reports.length === 0) {
    const isError = !!error;
    return (
      <div className="rdp-page">
        <button type="button" className="rdp-back-link" onClick={() => navigate(ROUTES.REPORTS)}>
          <ArrowLeft size={16} /> Back
        </button>
        <PageHeader icon={<BarChartFill size={20} />} title={pageTitle} subtitle={historyDate ?? ""} actions={[]} />
        <div className="rdp-empty-state">
          <div className={`rdp-empty-icon ${isError ? "rdp-empty-icon--warn" : "rdp-empty-icon--muted"}`}>
            <FileEarmarkBarGraphFill size={36} />
          </div>
          <h3 className="rdp-empty-title">
            {isError ? "Report not available" : "No report for this date"}
          </h3>
          <p className="rdp-empty-body">
            {isError
              ? "This report may still be generating. Check back in a moment, or generate a new one."
              : "No report has been generated for this date yet. Generate one to see your performance breakdown."}
          </p>
          <div className="rdp-empty-actions">
            <button type="button" className="btn btn-outline-secondary px-4" onClick={() => navigate(ROUTES.REPORTS)}>
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  const report = reports[idx];
  const total = reports.length;
  const hasPrev = idx > 0;
  const hasNext = idx < total - 1;
  const goalsOnTrack = report.goals.filter(g => g.alignment_pct >= 75).length;
  const dateLabel = new Date(`${report.date}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata",
  });

  const paginationActions = total > 1 ? [
    {
      key: "prev",
      label: "Previous report",
      icon: <ChevronLeft size={15} />,
      iconOnly: true,
      disabled: !hasPrev,
      onClick: () => setIdx(i => i - 1),
      tone: "none" as const,
      className: "btn-ghost btn-icon",
    },
    {
      key: "next",
      label: "Next report",
      icon: <ChevronRight size={15} />,
      iconOnly: true,
      disabled: !hasNext,
      onClick: () => setIdx(i => i + 1),
      tone: "none" as const,
      className: "btn-ghost btn-icon",
    },
  ] : [];

  return (
    <div className="rdp-page">

      <button type="button" className="rdp-back-link" onClick={() => navigate(ROUTES.REPORTS)}>
        <ArrowLeft size={16} /> Back
      </button>

      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <PageHeader
        icon={<BarChartFill size={20} />}
        title={report.report_type === "weekly" ? "Weekly Report" : "Daily Report"}
        subtitle={`${dateLabel} · ${fmtTime(report.generated_at)}${total > 1 ? ` · ${idx + 1} of ${total}` : ""}`}
        actions={paginationActions}
      />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="surface rdp-hero">
        <AlignmentRing pct={report.alignment_score} size={118} />
        <div className="rdp-hero-content">
          <h2 className="rdp-hero-headline">{report.headline}</h2>
          <p className="rdp-hero-summary">{report.summary}</p>
        </div>
      </div>

      {/* ── Stats ────────────────────────────────────────────────────────── */}
      <div className="rdp-stats mt-3">
        <div className="rdp-stat rdp-stat--success">
          <span className="rdp-stat-val">{report.stats.tasks_done}/{report.stats.tasks_total}</span>
          <div className="rdp-stat-text">
            <span className="rdp-stat-name">Tasks Done</span>
            <span className="rdp-stat-hint">{report.report_type === "weekly" ? "weekly targets" : "daily targets"}</span>
          </div>
        </div>
        <div className="rdp-stat rdp-stat--info">
          <span className="rdp-stat-val">{report.stats.habits_done}/{report.stats.habits_total}</span>
          <div className="rdp-stat-text">
            <span className="rdp-stat-name">Habits Done</span>
            <span className="rdp-stat-hint">{report.report_type === "weekly" ? "tracked this week" : "tracked today"}</span>
          </div>
        </div>
        <div className="rdp-stat rdp-stat--brand">
          <span className="rdp-stat-val">{goalsOnTrack}/{report.goals.length}</span>
          <div className="rdp-stat-text">
            <span className="rdp-stat-name">Goals on Track</span>
            <span className="rdp-stat-hint">aligned ≥ 75%</span>
          </div>
        </div>
        <div className="rdp-stat rdp-stat--warn">
          <span className="rdp-stat-val">🔥 {report.stats.best_streak}</span>
          <div className="rdp-stat-text">
            <span className="rdp-stat-name">Best Streak</span>
            <span className="rdp-stat-hint">consecutive days</span>
          </div>
        </div>
      </div>

      {/* ── Goal Alignment ───────────────────────────────────────────────── */}
      <section className="rdp-section mt-3">
        <div className="rdp-section-head">
          <h2 className="rdp-section-title">Goal Alignment</h2>
          <span className="rdp-section-chip">{report.goals.length} goals</span>
        </div>
        <div className="rdp-goal-scroll-wrap">
          <div className="rdp-goal-cards">
            {report.goals.map(g => <GoalCard key={g.id} goal={g} />)}
          </div>
        </div>
      </section>

      {/* ── Highlights ───────────────────────────────────────────────────── */}
      <section className="rdp-section mt-3">
        <div className="rdp-section-head">
          <h2 className="rdp-section-title">{report.report_type === "weekly" ? "This Week's Highlights" : "Today's Highlights"}</h2>
        </div>
        <div className="rdp-highlights">
          {report.highlights.good.length > 0 && (
            <div className="rdp-highlight-col">
              <div className="rdp-highlight-label rdp-highlight-label--good">
                <CheckCircleFill size={11} /> Went well
              </div>
              {report.highlights.good.map((h, i) => (
                <div key={i} className="rdp-highlight-item rdp-highlight-item--good">{h}</div>
              ))}
            </div>
          )}
          {report.highlights.attention.length > 0 && (
            <div className="rdp-highlight-col">
              <div className="rdp-highlight-label rdp-highlight-label--attention">
                <ExclamationTriangleFill size={11} /> Needs attention
              </div>
              {report.highlights.attention.map((h, i) => (
                <div key={i} className="rdp-highlight-item rdp-highlight-item--attention">{h}</div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Closing ──────────────────────────────────────────────────────── */}
      <div className="rdp-closing mt-3">
        <span className="rdp-closing-icon" aria-hidden="true">{CLOSING_EMOJI[report.closing.tone]}</span>
        <p className="rdp-closing-msg">{report.closing.message}</p>
      </div>

    </div>
  );
}
