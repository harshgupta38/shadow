import { useMemo, useState, type ReactNode } from "react";

import { useChartTooltip } from "../ChartTooltip/ChartTooltip";
import "./Sparkline.scss";

interface SparklineProps {
  values: (number | null)[];
  width: number;
  height: number;
  fluid?: boolean;
  ariaLabel: string;
  describe: (index: number, value: number) => ReactNode;
}

interface Point { i: number; x: number; y: number }

const PAD_X = 8;
const PAD_Y = 8;
const HIT_RADIUS = 13;
const END_DOT_RADIUS = 4.5;
const HOVER_DOT_RADIUS = 4;

// Points are positioned on a min/max domain (padded) so small movements stay visible.
// Nulls break the line: contiguous runs become separate segments.
function buildGeometry(values: (number | null)[], width: number, height: number) {
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) return null;

  const lo = Math.max(0, Math.min(...present) - 6);
  const hi = Math.min(100, Math.max(...present) + 6);
  const span = Math.max(hi - lo, 1);
  const n = values.length;
  const baseline = height - PAD_Y;

  const points: (Point | null)[] = values.map((v, i) =>
    v === null ? null : {
      i,
      x: PAD_X + (n === 1 ? 0 : (i * (width - PAD_X * 2)) / (n - 1)),
      y: PAD_Y + (1 - (v - lo) / span) * (height - PAD_Y * 2),
    });

  const runs: Point[][] = [];
  for (const p of points) {
    if (!p) continue;
    const last = runs[runs.length - 1];
    if (last && last[last.length - 1].i === p.i - 1) last.push(p);
    else runs.push([p]);
  }

  const paths = runs
    .filter((run) => run.length > 1)
    .map((run) => {
      const line = run.map((p, j) => `${j === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
      return { line, area: `${line} L${run[run.length - 1].x.toFixed(1)} ${baseline} L${run[0].x.toFixed(1)} ${baseline} Z` };
    });

  return { points, paths, last: runs[runs.length - 1].slice(-1)[0] };
}

// Line + end dot, 10% area wash, and a 26px hit target per point for hover.
export function Sparkline({ values, width, height, fluid = false, ariaLabel, describe }: SparklineProps) {
  const { wrapRef, show, hide, node } = useChartTooltip();
  const [hover, setHover] = useState<number | null>(null);
  const geo = useMemo(() => buildGeometry(values, width, height), [values, width, height]);

  if (!geo) return null;
  const hovered = hover !== null && hover !== geo.last.i ? geo.points[hover] : null;
  // Hover and keyboard focus share one path, so a tap on a touch screen (which focuses the point) keeps the tooltip.
  const reveal = (i: number, el: Element) => { setHover(i); show(el, describe(i, values[i] as number)); };
  const conceal = () => { setHover(null); hide(); };

  return (
    <div
      ref={wrapRef}
      className={`wi-spark${fluid ? " wi-spark--fluid" : ""}`}
      style={fluid ? undefined : { width }}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={fluid ? "100%" : width}
        height={fluid ? undefined : height}
        role="img"
        aria-label={ariaLabel}
        className="wi-spark-svg"
      >
        {geo.paths.map((p, k) => (
          <g key={k}>
            <path d={p.area} className="wi-spark-area" />
            <path d={p.line} className="wi-spark-line" />
          </g>
        ))}
        <circle cx={geo.last.x} cy={geo.last.y} r={END_DOT_RADIUS} className="wi-spark-end" />
        {hovered && <circle cx={hovered.x} cy={hovered.y} r={HOVER_DOT_RADIUS} className="wi-spark-end" />}
        {geo.points.map((p) => p && (
          <circle
            key={p.i}
            cx={p.x}
            cy={p.y}
            r={HIT_RADIUS}
            className="wi-spark-hit"
            tabIndex={0}
            onPointerEnter={(e) => reveal(p.i, e.currentTarget)}
            onPointerLeave={conceal}
            onFocus={(e) => reveal(p.i, e.currentTarget)}
            onBlur={conceal}
          />
        ))}
      </svg>
      {node}
    </div>
  );
}
