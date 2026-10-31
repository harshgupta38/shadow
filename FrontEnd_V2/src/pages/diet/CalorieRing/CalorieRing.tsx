import { barPercent, fmt } from "@/pages/diet/dietMath";
import "./CalorieRing.scss";

interface CalorieRingProps {
  consumed: number;
  target: number;
  size?: number;
}

const STROKE = 14;

/** Calories eaten against the daily target. The ring turns amber past the target, and the centre says by how much. */
export function CalorieRing({ consumed, target, size = 176 }: CalorieRingProps) {
  const radius = (size - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const percent = target > 0 ? (consumed / target) * 100 : 0;
  const over = consumed > target;
  const remaining = Math.round(target - consumed);
  const offset = circumference - (barPercent(percent) / 100) * circumference;
  const label = over
    ? `${fmt(Math.abs(remaining))} calories over the ${fmt(target)} calorie target`
    : `${fmt(remaining)} calories left of ${fmt(target)}`;

  return (
    <div className="dt-ring" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <defs>
          <linearGradient id="dt-ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--jv-brand-1)" />
            <stop offset="100%" stopColor="var(--jv-brand-2)" />
          </linearGradient>
        </defs>
        <circle className="dt-ring-track" cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={STROKE} />
        <circle
          className={`dt-ring-value${over ? " is-over" : ""}`}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={STROKE}
          stroke={over ? undefined : "url(#dt-ring-gradient)"}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="dt-ring-inner" aria-hidden="true">
        <span className="dt-ring-number">{fmt(Math.abs(remaining))}</span>
        <span className="dt-ring-caption">{over ? "kcal over" : "kcal left"}</span>
      </div>
    </div>
  );
}
