import { useMemo } from "react";

import type { WeeklyMetricComparison, WeeklyScorePoint } from "@/api/types";
import { formatDuration } from "@/services/date.service";
import { TipLine, TipTitle } from "../ChartTooltip/ChartTooltip";
import { Delta } from "../Delta/Delta";
import { Sparkline } from "../Sparkline/Sparkline";
import { SPARK_SIZE } from "../WeeklyInsights.constants";
import type { WeekLabels } from "../useWeekLabels";
import "./VsLastWeek.scss";

interface VsLastWeekProps {
  comparison: WeeklyMetricComparison[];
  scoreTrend: WeeklyScorePoint[];
  labels: WeekLabels;
}

function formatValue(m: WeeklyMetricComparison): string {
  return m.kind === "minutes" ? formatDuration(m.value) : `${m.value}${m.suffix ?? ""}`;
}

export function VsLastWeek({ comparison, scoreTrend, labels }: VsLastWeekProps) {
  const score = comparison.find((m) => m.id === "alignment");
  const rest = comparison.filter((m) => m.id !== "alignment");
  const weeks = scoreTrend.length;
  const values = useMemo(() => scoreTrend.map((p) => p.score), [scoreTrend]);
  const hasTrend = values.filter((v) => v !== null).length >= 2;

  return (
    <div className="wi-vs">
      {score && (
        <div className="wi-vs-hero">
          <div className="wi-vs-hero-top">
            <div>
              <span className="wi-vs-label">{score.label}</span>
              <span className="wi-vs-hero-val">{score.value}</span>
            </div>
            {score.previous !== null && <Delta delta={score.value - score.previous} kind={score.kind} />}
          </div>

          {hasTrend ? (
            <>
              <Sparkline
                fluid
                width={SPARK_SIZE.TREND.width}
                height={SPARK_SIZE.TREND.height}
                values={values}
                ariaLabel={`Alignment score by week, oldest first: ${values.map((v) => v ?? "no report").join(", ")}`}
                describe={(i, v) => (
                  <>
                    <TipTitle>{i === weeks - 1 ? "This week" : `Week ending ${labels.formatDate(scoreTrend[i].week_end)}`}</TipTitle>
                    <TipLine label="Alignment" value={v} />
                  </>
                )}
              />
              <div className="wi-vs-axis">
                <span>{weeks - 1} weeks ago</span>
                <span>This week</span>
              </div>
            </>
          ) : (
            <p className="wi-vs-first">Your trend line appears after your second weekly report.</p>
          )}
        </div>
      )}

      <ul className="wi-vs-list">
        {rest.map((m) => (
          <li key={m.id} className="wi-vs-row">
            <span className="wi-vs-name">{m.label}</span>
            <span className="wi-vs-val">{formatValue(m)}</span>
            {m.previous === null
              ? <span className="wi-muted wi-vs-none">–</span>
              : <Delta delta={m.value - m.previous} kind={m.kind} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
