import { describe, expect, it } from "vitest";

import type { ActivityLog } from "@/api";
import { toISODate } from "./format";
import { computeMetricStats } from "./metrics";

function log(daysAgo: number, value: number): ActivityLog {
  const date = toISODate(new Date(Date.now() - daysAgo * 24 * 3_600_000));
  return {
    id: Math.random(),
    metric_id: 1,
    date,
    value,
    note: null,
    source: "manual",
    created_at: new Date().toISOString(),
  };
}

describe("computeMetricStats", () => {
  it("returns zeros for no logs", () => {
    const stats = computeMetricStats([]);
    expect(stats.todayTotal).toBe(0);
    expect(stats.weekTotal).toBe(0);
    expect(stats.streak).toBe(0);
    expect(stats.spark).toHaveLength(7);
  });

  it("sums today's and this week's totals", () => {
    const stats = computeMetricStats([log(0, 3), log(0, 2), log(1, 4), log(6, 1)]);
    expect(stats.todayTotal).toBe(5); // 3 + 2 today
    expect(stats.weekTotal).toBe(10); // 5 + 4 + 1 within 7 days
    expect(stats.spark).toHaveLength(7);
    expect(stats.spark[6]).toBe(5); // today is last
  });

  it("counts a consecutive streak ending today", () => {
    const stats = computeMetricStats([log(0, 1), log(1, 1), log(2, 1)]);
    expect(stats.streak).toBe(3);
  });

  it("forgives a zero today but breaks on a gap", () => {
    // Nothing today, but yesterday and the day before have activity.
    const stats = computeMetricStats([log(1, 1), log(2, 1), log(4, 1)]);
    expect(stats.streak).toBe(2);
  });

  it("counts consecutive successful weeks in weekly streak mode", () => {
    const today = new Date();
    const daysSinceWeekStart = (today.getDay() + 6) % 7;

    const stats = computeMetricStats(
      [
        // Previous week: 3 completions (meets 3/week).
        log(daysSinceWeekStart + 1, 1),
        log(daysSinceWeekStart + 2, 1),
        log(daysSinceWeekStart + 3, 1),
        // Two weeks ago: 3 completions (meets 3/week).
        log(daysSinceWeekStart + 8, 1),
        log(daysSinceWeekStart + 9, 1),
        log(daysSinceWeekStart + 10, 1),
      ],
      { streakMode: "weekly", weeklyTarget: 3 },
    );

    // Current week is incomplete and should be forgiven, so streak counts previous successful weeks.
    expect(stats.streak).toBe(2);
  });
});
