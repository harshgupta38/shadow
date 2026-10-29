import { useMemo } from "react";

import type { WeeklyDay } from "@/api/types";
import { TipLine, TipTitle, useChartTooltip } from "../ChartTooltip/ChartTooltip";
import { THRESHOLDS, WEEKDAYS_LONG, WEEKDAYS_SHORT, pct } from "../WeeklyInsights.constants";
import type { WeekLabels } from "../useWeekLabels";
import "./WeekRhythm.scss";

interface WeekRhythmProps {
  days: WeeklyDay[];
  labels: WeekLabels;
}

interface DayRow {
  index: number;
  day: WeeklyDay;
  value: number | null; // null = nothing planned
  prev: number | null;
}

function summarize(days: WeeklyDay[]) {
  const rows: DayRow[] = days.map((day, index) => ({
    index,
    day,
    value: pct(day.tasks_done + day.habits_done, day.tasks_total + day.habits_total),
    prev: day.prev_completion_pct,
  }));
  const planned = rows.filter((r) => r.value !== null);

  let best: DayRow | null = null;
  let worst: DayRow | null = null;
  for (const r of planned) {
    if (!best || (r.value as number) > (best.value as number)) best = r;
    if (!worst || (r.value as number) < (worst.value as number)) worst = r;
  }
  // With a single planned day, or all days equal, there's nothing to contrast.
  const hasContrast = planned.length > 1 && best?.value !== worst?.value;

  return {
    rows,
    best,
    worst: hasContrast ? worst : null,
    plannedCount: planned.length,
    perfect: planned.filter((r) => r.value === 100).length,
    strong: planned.filter((r) => (r.value as number) >= THRESHOLDS.STRONG_DAY_PCT).length,
  };
}

export function WeekRhythm({ days, labels }: WeekRhythmProps) {
  const { wrapRef, show, hide, node } = useChartTooltip();
  const { rows, best, worst, plannedCount, perfect, strong } = useMemo(() => summarize(days), [days]);

  return (
    <div ref={wrapRef} className="wi-rhythm">
      <div className="wi-rhythm-plot">
        <div className="wi-rhythm-lines" aria-hidden="true">
          {[0, 50, 100].map((t) => (
            <span key={t} data-label={t} style={{ bottom: `${t}%` }} />
          ))}
        </div>
        <div className="wi-rhythm-cols">
          {rows.map((r) => {
            const isBest = r === best && worst !== null;
            const isWorst = r === worst;
            const tone = isBest ? "best" : isWorst ? "worst" : "base";
            const when = `${WEEKDAYS_LONG[r.index]}, ${labels.dayDates[r.index]}`;
            const spoken = r.value === null
              ? `${when}: nothing planned`
              : `${when}: ${r.value}% complete, ${r.day.tasks_done} of ${r.day.tasks_total} tasks, ${r.day.habits_done} of ${r.day.habits_total} habits`;
            const tip = (
              <>
                <TipTitle>{when}</TipTitle>
                {r.value === null ? (
                  <TipLine label="Nothing planned" value="–" />
                ) : (
                  <>
                    <TipLine label="Completed" value={`${r.value}%`} />
                    <TipLine label="Tasks" value={`${r.day.tasks_done}/${r.day.tasks_total}`} />
                    <TipLine label="Habits" value={`${r.day.habits_done}/${r.day.habits_total}`} />
                  </>
                )}
                {r.prev !== null && <TipLine label="Same day last week" value={`${r.prev}%`} />}
              </>
            );
            return (
              <div
                key={r.index}
                className="wi-rhythm-col"
                tabIndex={0}
                role="group"
                aria-label={spoken}
                onPointerEnter={(e) => show(e.currentTarget, tip)}
                onPointerLeave={hide}
                onFocus={(e) => show(e.currentTarget, tip)}
                onBlur={hide}
              >
                <div className="wi-rhythm-track">
                  {r.value === null ? (
                    <span className="wi-rhythm-empty">–</span>
                  ) : (
                    <>
                      {(isBest || isWorst) && (
                        <span className="wi-rhythm-val" style={{ bottom: `calc(${r.value}% + 6px)` }}>{r.value}%</span>
                      )}
                      <span
                        className={`wi-rhythm-bar wi-rhythm-bar--${tone}`}
                        style={{ height: `${Math.max(r.value, 3)}%`, animationDelay: `${r.index * 45}ms` }}
                      />
                    </>
                  )}
                  {r.prev !== null && <span className="wi-rhythm-prev" style={{ bottom: `${r.prev}%` }} />}
                </div>
                <span className="wi-rhythm-day">{WEEKDAYS_SHORT[r.index]}</span>
                <span className="wi-rhythm-date">{labels.dayNumbers[r.index]}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="wi-rhythm-foot">
        <div className="wi-legend">
          <span className="wi-legend-item"><i className="wi-key wi-key--bar" /> This week</span>
          <span className="wi-legend-item"><i className="wi-key wi-key--tick" /> Same day last week</span>
        </div>
        <div className="wi-chips">
          <span className="wi-chip"><strong>{strong}</strong> of {plannedCount} days above {THRESHOLDS.STRONG_DAY_PCT}%</span>
          <span className="wi-chip"><strong>{perfect}</strong> perfect {perfect === 1 ? "day" : "days"}</span>
        </div>
      </div>

      {best && (
        <p className="wi-insight">
          Strongest on <strong>{WEEKDAYS_LONG[best.index]}</strong> ({best.value}%)
          {worst && <> · softest on <strong>{WEEKDAYS_LONG[worst.index]}</strong> ({worst.value}%)</>}
        </p>
      )}
      {node}
    </div>
  );
}
