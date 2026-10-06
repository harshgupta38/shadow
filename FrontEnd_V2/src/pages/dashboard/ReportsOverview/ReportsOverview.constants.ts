import { buildMonthData, DAY_LABELS, fmtKey, tierOf } from "@/pages/reports/ReportsPage.constants";
import type { DayReport } from "@/api";
import type { ScoreTier } from "@/pages/reports/types";

export { ringColor } from "@/pages/reports/ReportDetailPage/ReportDetailPage.constants";
export { DAY_LABELS };

export interface CalCell {
  key: string;
  tier: ScoreTier | "filler";
  score: number | null;
  isToday: boolean;
  isFuture: boolean;
  hasDailyReport: boolean;
  hasWeeklyReport: boolean;
}

export function buildCalCells(monthDays: DayReport[], year: number, month: number, today: Date, weekStart: "monday" | "sunday" = "sunday"): CalCell[] {
  const monthMap = buildMonthData(year, month, monthDays);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = weekStart === "monday"
    ? (new Date(year, month, 1).getDay() + 6) % 7
    : new Date(year, month, 1).getDay();
  const cells: CalCell[] = [];

  for (let i = 0; i < firstDow; i++) {
    cells.push({ key: `f${i}`, tier: "filler", score: null, isToday: false, isFuture: false, hasDailyReport: false, hasWeeklyReport: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const key = fmtKey(year, month, d);
    const isFuture = date > today;
    const data = monthMap.get(key)!;
    cells.push({
      key,
      tier: isFuture ? "empty" : tierOf(data.score),
      score: isFuture ? null : (data.alignmentScore ?? data.score),
      isToday: date.toDateString() === today.toDateString(),
      isFuture,
      hasDailyReport: !isFuture && data.hasDailyReport,
      hasWeeklyReport: !isFuture && data.hasWeeklyReport,
    });
  }
  return cells;
}
