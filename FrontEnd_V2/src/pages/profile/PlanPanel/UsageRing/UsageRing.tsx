import "@/pages/profile/PlanPanel/UsageRing/UsageRing.scss";

interface UsageRingProps {
  /** How much of the monthly allowance is used, 0 to 100 and more. */
  percent: number;
}

const SIZE = 72;
const STROKE = 7;

/** The share of the AI allowance that is used, as a ring with the percentage and a caption in the middle. It turns red once the allowance is used up. */
export function UsageRing({ percent }: UsageRingProps) {
  const radius = (SIZE - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = Math.max(0, Math.min(100, percent));
  const rounded = Math.round(filled);
  const color = filled >= 100 ? "var(--jv-danger)" : "var(--jv-brand-1)";

  return (
    <div className="usage-ring" style={{ width: SIZE, height: SIZE }} role="img" aria-label={`${rounded}% of your AI allowance used`}>
      <svg width={SIZE} height={SIZE} aria-hidden="true">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={radius} fill="none" stroke="color-mix(in srgb, var(--jv-border) 88%, transparent)" strokeWidth={STROKE} />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - filled / 100)}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </svg>
      <span className="usage-ring-label">
        <span className="usage-ring-pct" style={{ color }}>
          {rounded}%
        </span>
        <span className="usage-ring-caption">used</span>
      </span>
    </div>
  );
}
