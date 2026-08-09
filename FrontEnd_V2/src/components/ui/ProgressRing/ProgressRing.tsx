import "@/components/ui/ProgressRing/ProgressRing.scss";

interface ProgressRingProps {
  percentage: number;
}

const RING_SIZE = 104;
const RING_STROKE = 10;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function clampPercentage(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(Math.round(value), 100));
}

export function ProgressRing({ percentage }: ProgressRingProps) {
  const clampedPercentage = clampPercentage(percentage);
  const dashOffset = RING_CIRCUMFERENCE - (clampedPercentage / 100) * RING_CIRCUMFERENCE;
  const gradientId = `progress-ring-${clampedPercentage}`;

  return (
    <div className="progress-ring-v2" aria-hidden="true">
      <svg className="progress-ring-v2-svg" width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--jv-brand-1)" />
            <stop offset="100%" stopColor="var(--jv-brand-2)" />
          </linearGradient>
        </defs>
        <circle
          className="progress-ring-v2-track"
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          strokeWidth={RING_STROKE}
        />
        <circle
          className="progress-ring-v2-value"
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          strokeWidth={RING_STROKE}
          stroke={`url(#${gradientId})`}
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
        />
      </svg>
      <div className="progress-ring-v2-inner">{clampedPercentage}%</div>
    </div>
  );
}