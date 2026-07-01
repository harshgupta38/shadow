import type { ReactNode } from "react";

import { clampPercent } from "@/lib/format";

interface ProgressRingProps {
  /** 0–100. */
  value: number;
  size?: number;
  stroke?: number;
  /** Overrides the centred percentage label. */
  label?: ReactNode;
  showLabel?: boolean;
}

let gradientSeq = 0;

export function ProgressRing({
  value,
  size = 88,
  stroke = 9,
  label,
  showLabel = true,
}: ProgressRingProps) {
  const pct = clampPercent(value);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  const gradientId = `jvGrad-${(gradientSeq += 1)}`;

  return (
    <div className="progress-ring-wrap" style={{ width: size, height: size }}>
      <svg className="progress-ring" width={size} height={size} aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--jv-brand-1)" />
            <stop offset="100%" stopColor="var(--jv-brand-2)" />
          </linearGradient>
        </defs>
        <circle
          className="progress-ring__track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke={`url(#${gradientId})`}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 600ms cubic-bezier(0.4,0,0.2,1)" }}
        />
      </svg>
      {showLabel && (
        <div className="progress-ring-label" style={{ fontSize: size * 0.24 }}>
          {label ?? `${pct}%`}
        </div>
      )}
    </div>
  );
}
