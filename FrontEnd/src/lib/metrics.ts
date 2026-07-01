import type { ActivityLog } from "@/api";
import { toISODate } from "./format";

export interface MetricStats {
  todayTotal: number;
  weekTotal: number;
  streak: number;
  /** Totals for the last 7 days, oldest → newest (today last). */
  spark: number[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Roll activity logs up into today/week totals, a streak and a 7-day sparkline. */
export function computeMetricStats(logs: ActivityLog[]): MetricStats {
  const byDay = new Map<string, number>();
  for (const log of logs) {
    byDay.set(log.date, (byDay.get(log.date) ?? 0) + log.value);
  }

  const spark: number[] = [];
  let weekTotal = 0;
  for (let i = 6; i >= 0; i--) {
    const day = toISODate(new Date(Date.now() - i * DAY_MS));
    const value = byDay.get(day) ?? 0;
    spark.push(value);
    weekTotal += value;
  }

  const todayTotal = byDay.get(toISODate()) ?? 0;

  // Consecutive days with activity, counting back from today. A zero today is
  // forgiven (streak counts up to yesterday) so it doesn't feel broken mid-day.
  let streak = 0;
  const cursor = new Date();
  if ((byDay.get(toISODate(cursor)) ?? 0) === 0) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while ((byDay.get(toISODate(cursor)) ?? 0) > 0) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return { todayTotal, weekTotal, streak, spark };
}
