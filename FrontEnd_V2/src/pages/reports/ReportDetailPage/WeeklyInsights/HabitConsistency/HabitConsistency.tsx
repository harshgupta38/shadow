import { useMemo, useState } from "react";
import { ArrowDownShort, CheckLg } from "react-bootstrap-icons";

import type { WeeklyHabit } from "@/api/types";
import { TipLine, TipTitle, useChartTooltip } from "../ChartTooltip/ChartTooltip";
import { Delta } from "../Delta/Delta";
import { HABIT_STATE_LABEL, THRESHOLDS, WEEKDAYS_LONG, WEEKDAY_INITIALS, pct } from "../WeeklyInsights.constants";
import type { WeekLabels } from "../useWeekLabels";
import "./HabitConsistency.scss";

interface HabitConsistencyProps {
  habits: WeeklyHabit[];
  labels: WeekLabels;
}

function rankHabits(habits: WeeklyHabit[]) {
  const rows = habits
    .map((h) => {
      const done = h.cells.filter((c) => c === "done").length;
      const planned = h.cells.filter((c) => c === "done" || c === "missed").length;
      const value = pct(done, planned) ?? 0;
      const prevValue = pct(h.prev_done, h.prev_planned);
      // Nothing planned this week (e.g. fully skipped): no rate and no trend to report.
      return { h, done, planned, value, trend: planned === 0 || prevValue === null ? null : value - prevValue };
    })
    .sort((a, b) => b.value - a.value || b.h.streak - a.h.streak);

  const mostConsistentId = rows.length > 0 && rows[0].value >= THRESHOLDS.CONSISTENT_HABIT_PCT ? rows[0].h.id : null;
  const slippedId = rows
    .filter((r) => r.trend !== null && r.trend <= THRESHOLDS.SLIPPED_HABIT_DELTA_PTS)
    .sort((a, b) => (a.trend as number) - (b.trend as number))[0]?.h.id ?? null;

  return { rows, mostConsistentId, slippedId };
}

export function HabitConsistency({ habits, labels }: HabitConsistencyProps) {
  const { wrapRef, show, hide, node } = useChartTooltip();
  const { rows, mostConsistentId, slippedId } = useMemo(() => rankHabits(habits), [habits]);
  const [expanded, setExpanded] = useState(false);

  // rows are sorted strongest → weakest, so a long list keeps both ends and hides the middle.
  const collapsible = rows.length > THRESHOLDS.HABITS_COLLAPSE_ABOVE;
  const visible = collapsible && !expanded
    ? [...rows.slice(0, THRESHOLDS.HABITS_SHOWN_PER_END), ...rows.slice(-THRESHOLDS.HABITS_SHOWN_PER_END)]
    : rows;

  return (
    <div ref={wrapRef} className="wi-habits">
      <div className="wi-habit-row wi-habit-row--head" aria-hidden="true">
        <span className="wi-habit-name" />
        <span className="wi-habit-dots">
          {WEEKDAY_INITIALS.map((d, i) => <span key={i} className="wi-habit-initial">{d}</span>)}
        </span>
        <span className="wi-habit-count">Done</span>
        <span className="wi-habit-streak">Streak</span>
        <span className="wi-habit-trend">vs last wk</span>
      </div>

      {visible.map(({ h, done, planned, value, trend }) => (
        <div
          key={h.id}
          className="wi-habit-row"
          role="group"
          aria-label={`${h.title}: ${done} of ${planned} days${h.streak > 1 ? `, ${h.streak} day streak` : ""}`}
        >
          <span className="wi-habit-name">
            <span className="wi-habit-title">{h.title}</span>
            {h.id === mostConsistentId && (
              <span className="wi-tag wi-tag--good"><CheckLg size={11} aria-hidden="true" /> Most consistent</span>
            )}
            {h.id === slippedId && (
              <span className="wi-tag wi-tag--bad"><ArrowDownShort size={13} aria-hidden="true" /> Slipped most</span>
            )}
          </span>
          <span className="wi-habit-dots">
            {h.cells.map((state, i) => (
              <span
                key={i}
                className="wi-dot-hit"
                onPointerEnter={(e) => show(e.currentTarget, (
                  <>
                    <TipTitle>{h.title}</TipTitle>
                    <TipLine label={`${WEEKDAYS_LONG[i]}, ${labels.dayDates[i]}`} value={HABIT_STATE_LABEL[state]} />
                  </>
                ))}
                onPointerLeave={hide}
              >
                <i className={`wi-dot wi-dot--${state}`} />
              </span>
            ))}
          </span>
          <span className="wi-habit-count">
            {planned === 0 ? <span className="wi-muted">–</span> : (
              <>
                <strong>{done}</strong>/{planned}
                <span className="wi-habit-pct">{value}%</span>
              </>
            )}
          </span>
          <span className="wi-habit-streak">{h.streak > 1 ? <>🔥 {h.streak}</> : <span className="wi-muted">–</span>}</span>
          <span className="wi-habit-trend">
            {trend === null ? <span className="wi-muted">–</span> : <Delta delta={trend} kind="points" />}
          </span>
        </div>
      ))}

      <div className="wi-habit-foot">
        {collapsible && (
          <button type="button" className="wi-more" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
            {expanded
              ? "Show fewer"
              : `Show all ${rows.length} habits · ${rows.length - visible.length} hidden`}
          </button>
        )}

        <div className="wi-legend wi-legend--dots">
          <span className="wi-legend-item"><i className="wi-dot wi-dot--done" /> Done</span>
          <span className="wi-legend-item"><i className="wi-dot wi-dot--missed" /> Missed</span>
          <span className="wi-legend-item"><i className="wi-dot wi-dot--skipped" /> Skipped</span>
          <span className="wi-legend-item"><i className="wi-dot wi-dot--none" /> Not planned</span>
        </div>
      </div>
      {node}
    </div>
  );
}
