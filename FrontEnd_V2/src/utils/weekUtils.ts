import type { WeekStartsOn } from "@/api";

// Column index (0-based) for a date's day in display order.
// Monday-first: Mon=0 … Sun=6. Sunday-first: Sun=0 … Sat=6.
export function dayToCol(date: Date, weekStart: WeekStartsOn): number {
  const dow = date.getDay(); // 0=Sun … 6=Sat
  return weekStart === "monday" ? (dow + 6) % 7 : dow;
}

// Number of filler cells before day 1 in a monthly calendar grid.
export function monthFirstDow(year: number, month: number, weekStart: WeekStartsOn): number {
  return dayToCol(new Date(year, month, 1), weekStart);
}

// 7-element day-label array in display order.
export function weekDayLabels(
  weekStart: WeekStartsOn,
  format: "short" | "letter" = "short",
): string[] {
  const short = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const letter = ["S", "M", "T", "W", "T", "F", "S"];
  const arr = format === "short" ? short : letter;
  return weekStart === "monday" ? [...arr.slice(1), arr[0]] : [...arr];
}

// Formatted week-range label, e.g. "Sep 7 – Sep 13, 2026".
export function weekRangeStr(today: Date, weekStart: WeekStartsOn): string {
  const daysFromStart = dayToCol(today, weekStart);
  const start = new Date(today);
  start.setDate(today.getDate() - daysFromStart);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(start)} – ${fmt(end)}, ${end.getFullYear()}`;
}
