/** Small, pure formatting helpers shared across the app. */

/** Local YYYY-MM-DD (avoids UTC off-by-one from `toISOString`). */
export function toISODate(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** "just now", "5m ago", "3h ago", "2d ago", else a short date. */
export function relativeTime(input: string | Date): string {
  const date = typeof input === "string" ? new Date(input) : input;
  const diff = Date.now() - date.getTime();
  if (Number.isNaN(diff)) return "";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** "Jul 1, 2026" */
export function formatDate(input?: string | Date | null): string {
  if (!input) return "";
  const date = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** "Jul 1, 2026 · 3:20 PM" */
export function formatDateTime(input?: string | Date | null): string {
  if (!input) return "";
  const date = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return "";
  return `${formatDate(date)} · ${date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

/** Days from now until a target date (negative = overdue). */
function daysUntil(input?: string | Date | null): number | null {
  if (!input) return null;
  const date = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - start.getTime()) / DAY_MS);
}

/** Human due-date label: "Due today", "Due in 3d", "Overdue by 2d". */
export function dueLabel(input?: string | Date | null): string | null {
  const d = daysUntil(input);
  if (d === null) return null;
  if (d === 0) return "Due today";
  if (d === 1) return "Due tomorrow";
  if (d > 1) return `Due in ${d}d`;
  if (d === -1) return "Overdue by 1d";
  return `Overdue by ${Math.abs(d)}d`;
}

/** Compact number: 1500 → "1.5k". */
export function compactNumber(value: number): string {
  if (Math.abs(value) < 1000) {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/** Minutes → "2h 40m" / "45m". */
export function formatMinutes(mins: number): string {
  const total = Math.round(mins);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Value + unit, unit-aware (minutes render as "2h 40m"). */
export function formatMetricValue(value: number, unit: string): string {
  if (unit === "minutes") return formatMinutes(value);
  if (unit === "hours") return `${compactNumber(value)}h`;
  return compactNumber(value);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Greeting based on local time of day. */
export function greeting(date: Date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
