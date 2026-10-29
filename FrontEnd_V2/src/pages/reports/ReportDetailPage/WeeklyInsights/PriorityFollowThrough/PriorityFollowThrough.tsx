import type { ReactNode } from "react";
import { CheckCircleFill, ExclamationTriangleFill, InfoCircleFill } from "react-bootstrap-icons";

import type { WeeklyPriorityTier } from "@/api/types";
import { TipLine, TipTitle, useChartTooltip } from "../ChartTooltip/ChartTooltip";
import { PRIORITY_LABEL, THRESHOLDS, pct } from "../WeeklyInsights.constants";
import "./PriorityFollowThrough.scss";

interface PriorityFollowThroughProps {
  tiers: WeeklyPriorityTier[];
  topMisses: string[];
}

type Insight = { tone: "bad" | "good" | "info"; text: ReactNode };

const INSIGHT_ICON = { bad: ExclamationTriangleFill, good: CheckCircleFill, info: InfoCircleFill } as const;

function buildInsight(rows: (WeeklyPriorityTier & { value: number | null })[]): Insight | null {
  const top = rows.find((r) => r.value !== null);
  const bottom = [...rows].reverse().find((r) => r.value !== null);
  if (!top || !bottom || top === bottom) return null;

  const topValue = top.value as number;
  const bottomValue = bottom.value as number;
  const topName = PRIORITY_LABEL[top.priority].toLowerCase();

  if (topValue + THRESHOLDS.PRIORITY_GAP_PTS < bottomValue) {
    return {
      tone: "bad",
      text: <>You finished <strong>{bottomValue}%</strong> of {PRIORITY_LABEL[bottom.priority].toLowerCase()}-priority items but only <strong>{topValue}%</strong> of your {topName} ones. Easier work is getting done first.</>,
    };
  }
  if (topValue >= THRESHOLDS.PRIORITY_GOOD_PCT) {
    return { tone: "good", text: <>Your {topName}-priority work is landing: <strong>{topValue}%</strong> done.</> };
  }
  return { tone: "info", text: <>{PRIORITY_LABEL[top.priority]}-priority completion was <strong>{topValue}%</strong>.</> };
}

export function PriorityFollowThrough({ tiers, topMisses }: PriorityFollowThroughProps) {
  const { wrapRef, show, hide, node } = useChartTooltip();

  const rows = tiers.map((t) => ({ ...t, value: pct(t.done, t.total) }));
  const insight = buildInsight(rows);
  const InsightIcon = insight ? INSIGHT_ICON[insight.tone] : null;

  return (
    <div ref={wrapRef} className="wi-prio">
      {rows.map((r, i) => {
        const tip = (
          <>
            <TipTitle>{PRIORITY_LABEL[r.priority]} priority</TipTitle>
            <TipLine label="Done" value={`${r.done} of ${r.total}`} />
            <TipLine label="Missed" value={r.total - r.done} />
          </>
        );
        return (
          <div
            key={r.priority}
            className="wi-prio-row"
            tabIndex={0}
            role="group"
            aria-label={`${PRIORITY_LABEL[r.priority]} priority: ${r.done} of ${r.total} done`}
            onPointerEnter={(e) => show(e.currentTarget, tip)}
            onPointerLeave={hide}
            onFocus={(e) => show(e.currentTarget, tip)}
            onBlur={hide}
          >
            <span className="wi-prio-label">{PRIORITY_LABEL[r.priority]}</span>
            <span className="wi-prio-track">
              {r.value !== null && (
                <span
                  className={`wi-prio-fill wi-prio-fill--${i}`}
                  style={{ width: `${Math.max(r.value, 2)}%`, animationDelay: `${i * 60}ms` }}
                />
              )}
            </span>
            <span className="wi-prio-val">{r.value === null ? "–" : `${r.value}%`}</span>
            <span className="wi-prio-count">{r.done}/{r.total}</span>
          </div>
        );
      })}

      {insight && InsightIcon && (
        <p className={`wi-callout wi-callout--${insight.tone}`}>
          <InsightIcon size={13} aria-hidden="true" />
          <span>{insight.text}</span>
        </p>
      )}

      {topMisses.length > 0 && (
        <div className="wi-prio-misses">
          <span className="wi-prio-misses-head">Left undone at highest priority</span>
          <ul>
            {topMisses.map((title, i) => <li key={`${i}-${title}`}>{title}</li>)}
          </ul>
        </div>
      )}
      {node}
    </div>
  );
}
