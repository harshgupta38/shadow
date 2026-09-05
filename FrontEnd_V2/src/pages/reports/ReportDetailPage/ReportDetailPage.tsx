import { useState } from "react";
import {
  BarChartFill,
  CheckCircleFill,
  ChevronLeft,
  ChevronRight,
  ExclamationTriangleFill,
} from "react-bootstrap-icons";

import type { DailyReportDetail, GoalAlignment } from "@/api/types";
import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import { CLOSING_EMOJI, fmtTime, ringColor } from "./ReportDetailPage.constants";
import "./ReportDetailPage.scss";

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_REPORTS: DailyReportDetail[] = [
  {
    date: "2026-09-05",
    generated_at: "2026-09-05T18:25:00+05:30",
    alignment_score: 58,
    headline: "Slow Start — Still Time to Turn It Around",
    summary: "Slow start to the day — only half your tasks were completed by evening. Fitness took a hit and the backend task stayed untouched. There's still time to recover if you push in the final hours.",
    stats: { tasks_done: 5, tasks_total: 10, habits_done: 2, habits_total: 4, best_streak: 6 },
    goals: [
      {
        id: 1,
        title: "Master Data Structures & Algorithms",
        alignment_pct: 75,
        milestone_title: "Arrays & Hashing",
        note: "3 problems solved but fell short of today's target of 5. Good pace — just needs more evening focus.",
        tasks_done: 3,
        tasks_total: 4,
      },
      {
        id: 2,
        title: "Build a Fitness Routine",
        alignment_pct: 20,
        milestone_title: "Week 3: Consistency",
        note: "Gym skipped again. Nutrition was okay but movement was missing. This is a pattern to watch closely.",
        tasks_done: 0,
        tasks_total: 3,
      },
      {
        id: 3,
        title: "Read 12 Books This Year",
        alignment_pct: 80,
        milestone_title: "Book 7: Atomic Habits",
        note: "30 minutes of reading done. You're on pace for the week — keep this up.",
        tasks_done: 1,
        tasks_total: 1,
      },
    ],
    highlights: {
      good: ["Reading habit done for the 5th consecutive day", "3 LeetCode problems solved"],
      attention: ["Gym session missed — second time this week", "Backend task not started", "Only 50% of daily tasks completed"],
    },
    closing: {
      tone: "guide",
      message: "You're at 58% today — below your usual pace. Prioritise the gym and the backend task tomorrow morning. One focused start can turn this week around completely.",
    },
  },
  {
    date: "2026-09-05",
    generated_at: "2026-09-05T23:55:00+05:30",
    alignment_score: 72,
    headline: "Strong Recovery — One Miss, Nine Wins",
    summary: "Strong recovery in the second half of the day. Coding tasks are done, the reading streak holds, and you made real progress on DSA. The gym was the only miss — one slip doesn't define the day.",
    stats: { tasks_done: 8, tasks_total: 10, habits_done: 3, habits_total: 4, best_streak: 7 },
    goals: [
      {
        id: 1,
        title: "Master Data Structures & Algorithms",
        alignment_pct: 88,
        milestone_title: "Arrays & Hashing",
        note: "All 4 problems solved and a mock interview completed. You're ahead of this week's pace — excellent focus.",
        tasks_done: 4,
        tasks_total: 4,
      },
      {
        id: 2,
        title: "Build a Fitness Routine",
        alignment_pct: 40,
        milestone_title: "Week 3: Consistency",
        note: "Gym missed today but nutrition was on point. One off day won't derail you — get back tomorrow.",
        tasks_done: 1,
        tasks_total: 3,
      },
      {
        id: 3,
        title: "Read 12 Books This Year",
        alignment_pct: 80,
        milestone_title: "Book 7: Atomic Habits",
        note: "30 minutes of reading done. You're on pace to finish Atomic Habits by end of the week.",
        tasks_done: 1,
        tasks_total: 1,
      },
    ],
    highlights: {
      good: ["All 4 DSA tasks done — strongest session in 2 weeks", "7-day coding streak maintained 🔥", "Reading habit done for 5th consecutive day"],
      attention: ["Gym session missed", "Backend task only half complete"],
    },
    closing: {
      tone: "motivate",
      message: "72% alignment is genuinely good. Your DSA progress is impressive and the streak is alive. One focused gym session tomorrow and you'll be firing on all cylinders — keep the momentum.",
    },
  },
  {
    date: "2026-09-05",
    generated_at: "2026-09-06T00:15:00+05:30",
    alignment_score: 81,
    headline: "Outstanding Finish — Every Target Hit",
    summary: "Outstanding finish. You completed the backend task late at night, hit your reading target, and your DSA momentum is at its peak. The gym is the one area to address this week — everything else is excellent.",
    stats: { tasks_done: 10, tasks_total: 10, habits_done: 4, habits_total: 4, best_streak: 7 },
    goals: [
      {
        id: 1,
        title: "Master Data Structures & Algorithms",
        alignment_pct: 92,
        milestone_title: "Arrays & Hashing",
        note: "All targets met plus a bonus problem. You're in the best form you've been in this month.",
        tasks_done: 4,
        tasks_total: 4,
      },
      {
        id: 2,
        title: "Build a Fitness Routine",
        alignment_pct: 50,
        milestone_title: "Week 3: Consistency",
        note: "Still no gym today. The consistency streak is at risk — tomorrow must be a non-negotiable day.",
        tasks_done: 1,
        tasks_total: 2,
      },
      {
        id: 3,
        title: "Read 12 Books This Year",
        alignment_pct: 100,
        milestone_title: "Book 7: Atomic Habits",
        note: "Full 45 minutes of focused reading — you exceeded today's target. You'll finish this book 2 days early.",
        tasks_done: 1,
        tasks_total: 1,
      },
    ],
    highlights: {
      good: ["All 10 tasks completed", "All 4 habits checked", "Backend feature shipped 🚀", "7-day coding streak alive"],
      attention: ["Gym missed — 3rd consecutive day this week"],
    },
    closing: {
      tone: "celebrate",
      message: "81% alignment — an excellent day by any standard. Every task done, every habit checked. Add the gym tomorrow and you're looking at a perfect week. Genuinely proud of this effort.",
    },
  },
];

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
  const [idx, setIdx] = useState(1);
  const report = MOCK_REPORTS[idx];
  const total = MOCK_REPORTS.length;
  const hasPrev = idx > 0;
  const hasNext = idx < total - 1;
  const goalsOnTrack = report.goals.filter(g => g.alignment_pct >= 75).length;

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
        subtitle={`${new Date(`${report.date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · ${fmtTime(report.generated_at)}`}
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
