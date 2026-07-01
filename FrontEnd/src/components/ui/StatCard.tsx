import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  /** Small helper line under the value (e.g. a trend or target). */
  hint?: ReactNode;
  /** Optional right-aligned visual (sparkline, ring). */
  visual?: ReactNode;
  accent?: string;
}

export function StatCard({ label, value, icon, hint, visual, accent }: StatCardProps) {
  return (
    <div className="surface stat-card h-100 p-3 p-sm-4">
      <div className="d-flex align-items-start justify-content-between gap-2">
        <div className="min-w-0">
          {icon && (
            <div
              className="stat-icon mb-3"
              style={accent ? { background: `${accent}22`, color: accent } : undefined}
            >
              {icon}
            </div>
          )}
          <div className="stat-value">{value}</div>
          <div className="stat-label mt-1">{label}</div>
          {hint && <div className="small text-muted-2 mt-2">{hint}</div>}
        </div>
        {visual && <div className="flex-shrink-0">{visual}</div>}
      </div>
    </div>
  );
}
