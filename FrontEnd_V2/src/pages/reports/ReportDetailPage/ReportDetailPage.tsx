import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  BarChartFill,
  CheckCircleFill,
  ChevronLeft,
  ChevronRight,
  ExclamationTriangleFill,
} from "react-bootstrap-icons";

import { api } from "@/api";
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

// ── Page ──────────────────────────────────────────────────────────────────────

export function ReportDetailPage() {
  const { historyDate } = useParams<{ historyDate: string }>();
  const [searchParams] = useSearchParams();
  const reportType = (searchParams.get("report_type") ?? "daily") as "daily" | "weekly";

  const [reports, setReports] = useState<DailyReportDetail[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!historyDate) return;
    setLoading(true);
    setError(null);
    api.reports.getReports(historyDate, reportType)
      .then(data => { setReports(data); setIdx(0); })
      .catch(() => setError("Report not found. It may still be generating — check back in a moment."))
      .finally(() => setLoading(false));
  }, [historyDate, reportType]);

  if (loading) {
    return (
      <div className="rdp-page">
        <PageHeader icon={<BarChartFill size={20} />} title="Daily Report" subtitle="Loading…" actions={[]} />
        <div className="rdp-empty">Loading report…</div>
      </div>
    );
  }

  if (error || reports.length === 0) {
    return (
      <div className="rdp-page">
        <PageHeader icon={<BarChartFill size={20} />} title="Daily Report" subtitle={historyDate ?? ""} actions={[]} />
        <div className="rdp-empty rdp-empty--error">{error ?? "No reports found for this date."}</div>
      </div>
    );
  }

  const report = reports[idx];
  const total = reports.length;
  const hasPrev = idx > 0;
  const hasNext = idx < total - 1;
  const goalsOnTrack = report.goals.filter(g => g.alignment_pct >= 75).length;
  const dateLabel = new Date(`${report.date}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
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

      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <PageHeader
        icon={<BarChartFill size={20} />}
        title="Daily Report"
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
            <span className="rdp-stat-hint">daily targets</span>
          </div>
        </div>
        <div className="rdp-stat rdp-stat--info">
          <span className="rdp-stat-val">{report.stats.habits_done}/{report.stats.habits_total}</span>
          <div className="rdp-stat-text">
            <span className="rdp-stat-name">Habits Done</span>
            <span className="rdp-stat-hint">tracked today</span>
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
          <h2 className="rdp-section-title">Today's Highlights</h2>
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
