import type { ActivityLog } from "@/api";
import { toISODate } from "./format";

interface MetricStats {
  todayTotal: number;
  weekTotal: number;
  streak: number;
  /** Totals for the last 7 days, oldest → newest (today last). */
  spark: number[];
}

interface MetricStatsOptions {
  streakMode?: "daily" | "weekly";
  weeklyTarget?: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfWeek(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  const weekday = (normalized.getDay() + 6) % 7; // Monday=0
  normalized.setDate(normalized.getDate() - weekday);
  return normalized;
}

function computeDailyStreak(byDay: Map<string, number>): number {
  let streak = 0;
  const cursor = new Date();
  if ((byDay.get(toISODate(cursor)) ?? 0) === 0) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while ((byDay.get(toISODate(cursor)) ?? 0) > 0) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function computeWeeklyTargetStreak(
  byDay: Map<string, number>,
  weeklyTarget: number,
): number {
  const byWeek = new Map<string, number>();
  for (const [dayKey, value] of byDay.entries()) {
    const weekKey = toISODate(startOfWeek(new Date(`${dayKey}T00:00:00`)));
    byWeek.set(weekKey, (byWeek.get(weekKey) ?? 0) + value);
  }

  const target = Math.max(1, Math.round(weeklyTarget));
  let streak = 0;
  const cursor = startOfWeek(new Date());

  // Forgive an incomplete current week, same spirit as daily streak forgiving zero today.
  if ((byWeek.get(toISODate(cursor)) ?? 0) < target) {
    cursor.setDate(cursor.getDate() - 7);
  }

  while ((byWeek.get(toISODate(cursor)) ?? 0) >= target) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 7);
  }

  return streak;
}

/** Roll activity logs up into today/week totals, a streak and a 7-day sparkline. */
export function computeMetricStats(
  logs: ActivityLog[],
  options: MetricStatsOptions = {},
): MetricStats {
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

  const streak =
    options.streakMode === "weekly"
      ? computeWeeklyTargetStreak(byDay, options.weeklyTarget ?? 1)
      : computeDailyStreak(byDay);

  return { todayTotal, weekTotal, streak, spark };
}
