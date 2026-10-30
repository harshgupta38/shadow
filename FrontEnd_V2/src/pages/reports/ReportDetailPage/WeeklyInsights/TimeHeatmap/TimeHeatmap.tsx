import { useMemo, type CSSProperties } from "react";

import type { WeeklyTimeSlot } from "@/api/types";
import { TipLine, TipTitle, useChartTooltip } from "../ChartTooltip/ChartTooltip";
import { SLOT_LABEL, THRESHOLDS, WEEKDAYS_LONG, WEEKDAY_INITIALS, pct, sum } from "../WeeklyInsights.constants";
import type { WeekLabels } from "../useWeekLabels";
import "./TimeHeatmap.scss";

interface TimeHeatmapProps {
  slots: WeeklyTimeSlot[];
  unslottedCount: number;
  labels: WeekLabels;
}

const SCALE_STEPS = [0.12, 0.3, 0.5, 0.72, 0.94];
const DARK_TEXT_ABOVE = 0.55;

const brandMix = (share: number) => `color-mix(in srgb, var(--jv-brand-1) ${Math.round(share * 100)}%, var(--jv-surface))`;

function buildHeatmap(slots: WeeklyTimeSlot[]) {
  const maxDone = Math.max(1, ...slots.flatMap((s) => s.done));

  const rows = slots.map((s) => {
    const rate = pct(sum(s.done), sum(s.planned));
    const cells = s.done.map((count, i) => {
      const planned = s.planned[i];
      const strength = count / maxDone;
      const style: CSSProperties | undefined = planned > 0 && count > 0
        ? { background: brandMix(0.16 + strength * 0.78) }
        : undefined;
      return { count, planned, style, dark: strength > DARK_TEXT_ABOVE };
    });
    return { slot: s, rate, plannedTotal: sum(s.planned), cells };
  });

  const eligible = rows.filter((r) => r.plannedTotal >= THRESHOLDS.MIN_SLOT_SAMPLE && r.rate !== null);
  let best = null as (typeof rows)[number] | null;
  let worst = null as (typeof rows)[number] | null;
  for (const r of eligible) {
    if (!best || (r.rate as number) > (best.rate as number)) best = r;
    if (!worst || (r.rate as number) < (worst.rate as number)) worst = r;
  }
  const hasContrast = eligible.length > 1 && best !== worst;

  return { rows, best: hasContrast ? best : null, worst: hasContrast ? worst : null };
}

export function TimeHeatmap({ slots, unslottedCount, labels }: TimeHeatmapProps) {
  const { wrapRef, show, hide, node } = useChartTooltip();
  const { rows, best, worst } = useMemo(() => buildHeatmap(slots), [slots]);

  return (
    <div ref={wrapRef} className="wi-heat">
      <div className="wi-heat-grid" role="table" aria-label="Completed items by time of day and weekday">
        <div className="wi-heat-line" aria-hidden="true">
          <span />
          {WEEKDAY_INITIALS.map((d, i) => <span key={i} className="wi-heat-head">{d}</span>)}
          <span className="wi-heat-head wi-heat-head--rate">Rate</span>
        </div>

        {rows.map(({ slot, rate, cells }) => (
          <div key={slot.id} className="wi-heat-line" role="row">
            <span className="wi-heat-slot" role="rowheader">{SLOT_LABEL[slot.id]}</span>
            {cells.map((c, i) => {
              const tip = (
                <>
                  <TipTitle>{SLOT_LABEL[slot.id]} · {WEEKDAYS_LONG[i]} {labels.dayDates[i]}</TipTitle>
                  <TipLine label="Completed" value={c.planned === 0 ? "Nothing planned" : `${c.count} of ${c.planned}`} />
                </>
              );
              return (
                <span
                  key={i}
                  role="cell"
                  tabIndex={0}
                  className={`wi-heat-cell${c.planned === 0 ? " wi-heat-cell--empty" : ""}${c.dark ? " wi-heat-cell--dark" : ""}`}
                  style={c.style}
                  onPointerEnter={(e) => show(e.currentTarget, tip)}
                  onPointerLeave={hide}
                  onFocus={(e) => show(e.currentTarget, tip)}
                  onBlur={hide}
                >
                  {c.planned === 0 ? "" : c.count}
                </span>
              );
            })}
            <span className="wi-heat-rate" role="cell">{rate === null ? "–" : `${rate}%`}</span>
          </div>
        ))}
      </div>

      <div className="wi-heat-foot">
        {unslottedCount > 0 && (
          <p className="wi-heat-note">
            {unslottedCount} flexible {unslottedCount === 1 ? "item has" : "items have"} no fixed time, so {unslottedCount === 1 ? "it isn't" : "they aren't"} shown here.
          </p>
        )}

        <div className="wi-heat-scale" aria-hidden="true">
          <span>Fewer</span>
          {SCALE_STEPS.map((s) => <i key={s} style={{ background: brandMix(s) }} />)}
          <span>More completed</span>
        </div>
      </div>

      {best && worst && (
        <p className="wi-insight">
          <strong>{SLOT_LABEL[best.slot.id]}s</strong> are your strongest slot ({best.rate}% done) ·{" "}
          <strong>{SLOT_LABEL[worst.slot.id].toLowerCase()}s</strong> are where plans slip ({worst.rate}%).
        </p>
      )}
      {node}
    </div>
  );
}
