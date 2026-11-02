import type { DietProfile, DietScoreDay, WeekStartsOn } from "@/api";
import { fmt } from "@/pages/diet/DietPage.constants";
import { tierOf } from "@/pages/reports/ReportsPage.constants";
import type { ScoreTier } from "@/pages/reports/types";
import { monthFirstDow } from "@/utils/weekUtils";

export const RING_RADIUS = 16;
export const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export type CalendarCell =
  | { type: "filler"; key: string }
  | { type: "day"; key: string; day: number; tier: ScoreTier; isToday: boolean; isFuture: boolean; data: DietScoreDay | null };

/** One cell per date of the month, preceded by the empty cells that line day 1 up with its weekday. */
export function buildCells(month: string, today: string, weekStart: WeekStartsOn, days: DietScoreDay[]): CalendarCell[] {
  const [year, monthNumber] = month.split("-").map(Number);
  const byDate = new Map(days.map((day) => [day.date, day]));
  const cells: CalendarCell[] = Array.from({ length: monthFirstDow(year, monthNumber - 1, weekStart) }, (_, i) => ({ type: "filler", key: `f${i}` }));
  const lastDay = new Date(year, monthNumber, 0).getDate();
  for (let day = 1; day <= lastDay; day++) {
    const key = `${month}-${String(day).padStart(2, "0")}`;
    const data = byDate.get(key) ?? null;
    const isFuture = key > today;
    cells.push({ type: "day", key, day, tier: isFuture ? "empty" : tierOf(data?.score ?? null), isToday: key === today, isFuture, data });
  }
  return cells;
}

export interface MonthSummary {
  loggedDays: number;
  averageScore: number | null;
  /** Days whose calories came within 10% of the target, the same band the score gives full marks for. */
  onCalorieTargetDays: number;
  proteinTargetDays: number;
  averageCalories: number | null;
}

export function summarize(days: DietScoreDay[], profile: DietProfile): MonthSummary {
  const count = days.length;
  const sum = (pick: (day: DietScoreDay) => number) => days.reduce((total, day) => total + pick(day), 0);
  return {
    loggedDays: count,
    averageScore: count ? Math.round(sum((day) => day.score) / count) : null,
    onCalorieTargetDays: days.filter((day) => Math.abs(day.totals.calories - profile.calorie_target) <= profile.calorie_target * 0.1).length,
    proteinTargetDays: days.filter((day) => day.totals.protein_g >= profile.protein_target_g).length,
    averageCalories: count ? Math.round(sum((day) => day.totals.calories) / count) : null,
  };
}

export interface StatCard {
  key: string;
  tone: "brand" | "success" | "warn" | "info";
  value: string;
  name: string;
  hint: string;
}

/** The four cards above the calendar. */
export function statCards(summary: MonthSummary, profile: DietProfile): StatCard[] {
  const outOf = (count: number) => (summary.loggedDays ? `${count}/${summary.loggedDays}` : "—");
  return [
    {
      key: "score",
      tone: "brand",
      value: summary.averageScore === null ? "—" : `${summary.averageScore}%`,
      name: "Average score",
      hint: `${summary.loggedDays} logged ${summary.loggedDays === 1 ? "day" : "days"}`,
    },
    { key: "calories", tone: "success", value: outOf(summary.onCalorieTargetDays), name: "On calorie target", hint: `within 10% of ${fmt(profile.calorie_target)} kcal` },
    { key: "protein", tone: "warn", value: outOf(summary.proteinTargetDays), name: "Protein target met", hint: `${fmt(profile.protein_target_g)} g a day` },
    {
      key: "intake",
      tone: "info",
      value: summary.averageCalories === null ? "—" : fmt(summary.averageCalories),
      name: "Average kcal",
      hint: `target ${fmt(profile.calorie_target)} kcal`,
    },
  ];
}
