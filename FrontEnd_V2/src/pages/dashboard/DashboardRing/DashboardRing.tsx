import { ringColor } from "@/pages/dashboard/ReportsOverview/ReportsOverview.constants";
// The ring's label classes belong to the Reports Overview card it first appeared in.
import "@/pages/dashboard/ReportsOverview/ReportsOverview.scss";

interface DashboardRingProps {
  /** How full the ring is, 0 to 100. It also picks the colour. */
  percent: number;
  /** The big text in the middle. */
  value: string;
  /** The small text under it. */
  caption: string;
  ariaLabel: string;
  size?: number;
  stroke?: number;
}

/** The score ring the dashboard cards share: a coloured arc, with a value and a caption in the middle. */
export function DashboardRing({ percent, value, caption, ariaLabel, size = 96, stroke = 9 }: DashboardRingProps) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = Math.max(0, Math.min(100, percent));
  const color = ringColor(filled);

  return (
    <div className="dp-report-ring-wrap" style={{ width: size, height: size }} role="img" aria-label={ariaLabel}>
      <svg width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="color-mix(in srgb, var(--jv-border) 88%, transparent)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - filled / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="dp-report-ring-label">
        <span className="dp-report-ring-pct" style={{ color }}>{value}</span>
        <span className="dp-report-ring-sub">{caption}</span>
      </div>
    </div>
  );
}
