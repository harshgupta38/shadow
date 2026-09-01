import type React from "react";
import { CheckLg } from "react-bootstrap-icons";
import type { MetricHabitData } from "@/api/types";
import "./MetricHabitCard.scss";

// ── Sparkline SVG ─────────────────────────────────────────────────────────────

function Sparkline({ values, habitId, color }: { values: number[]; habitId: number; color: string }) {
  const max = Math.max(...values, 0.01);
  const W = 200;
  const H = 50;
  const padY = 4;
  const step = W / Math.max(values.length - 1, 1);

  const pts = values.map((v, i) => ({
    x: i * step,
    y: H - padY - (v / max) * (H - padY * 2),
  }));

  const polyPoints = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPoints = `0,${H} ${polyPoints} ${W},${H}`;
  const gradId = `sg-${habitId}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={`tp-mc-sparkline tp-mc-sparkline--${color}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.01" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#${gradId})`} />
      <polyline
        points={polyPoints}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Today dot */}
      <circle
        cx={pts[pts.length - 1].x.toFixed(1)}
        cy={pts[pts.length - 1].y.toFixed(1)}
        r="3"
        fill="currentColor"
      />
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MetricHabitCard({ habit: h }: { habit: MetricHabitData }) {
  const todayVal = h.current_value;
  const pct = Math.min(100, Math.round((todayVal / h.planner_target) * 100));

  const nonZero = h.history.filter(v => v > 0);
  const avg = nonZero.length > 0
    ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length
    : 0;
  const best = Math.max(...h.history);
  const weekTotal = h.history.reduce((a, b) => a + b, 0);
  const goalMet = pct >= 100;

  return (
    <article className={`tp-metric-card tp-metric-card--${h.color}`}>
      <div className="tp-mc-inner">

        {/* ── Head ── */}
        <div className="tp-mc-head">
          <h3 className="tp-mc-title">{h.title}</h3>
          <div className="tp-mc-badges">
            {h.current_streak > 0 && (
              <span className="tp-mc-streak">🔥 {h.current_streak}</span>
            )}
            {h.category && (<span className={`tp-mc-cat tp-mc-cat--${h.color}`}>{h.category}</span>)}
          </div>
        </div>

        {/* ── Today Value ── */}
        <div className="tp-mc-value-row">
          <span className="tp-mc-value">{todayVal}</span>
          <div className="tp-mc-value-meta">
            <span className="tp-mc-unit">{h.value_unit}</span>
            <span className="tp-mc-of-target">/ {h.planner_target} today</span>
          </div>
          {goalMet && <span className="tp-mc-goal-pill"><CheckLg size={12} /></span>}
        </div>

        {/* ── Progress Bar ── */}
        <div className="tp-mc-bar-track">
          <div
            className="tp-mc-bar-fill"
            style={{ "--pct": `${pct}%` } as React.CSSProperties}
          />
        </div>
        <div className="tp-mc-bar-meta">
          <span className="tp-mc-bar-pct">{pct}% of daily goal</span>
          <span className="tp-mc-bar-best">Best: {best} {h.value_unit}</span>
        </div>

      </div>

      {/* ── Sparkline ── */}
      <div className="tp-mc-spark-wrap">
        <Sparkline values={h.history} habitId={h.id} color={h.color} />
        <span className="tp-mc-spark-label">7-day trend</span>
      </div>

      {/* ── Footer Stats ── */}
      <div className="tp-mc-footer">
        <div className="tp-mc-fstat">
          <span className="tp-mc-fval">{avg.toFixed(1)}<em> {h.value_unit}</em></span>
          <span className="tp-mc-fkey">avg</span>
        </div>
        <div className="tp-mc-fsep" />
        <div className="tp-mc-fstat">
          <span className="tp-mc-fval">{weekTotal}<em> {h.value_unit}</em></span>
          <span className="tp-mc-fkey">this week</span>
        </div>
        <div className="tp-mc-fsep" />
        <div className="tp-mc-fstat">
          <span className="tp-mc-fval">{h.max_streak}<em>d</em></span>
          <span className="tp-mc-fkey">best streak</span>
        </div>
      </div>
    </article>
  );
}
