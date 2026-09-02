import type { DayReport } from "@/api/types";
import { todayDate } from "@/services/date.service";

// ─── Constants ─────────────────────────────────────────────────────────────────

export const TODAY = todayDate();

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const RING_CIRC = 2 * Math.PI * 16; // circumference for r=16 ring

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ScoreTier = "empty" | "poor" | "low" | "mid" | "good" | "great";

export interface DayData {
  score: number | null;
  habitsTotal: number;
  habitsDone: number;
  tasksTotal: number;
  tasksDone: number;
}

export interface CalDay {
  type: "day";
  date: Date;
  key: string;
  data: DayData;
  isToday: boolean;
  isFuture: boolean;
}

export interface CalFiller { type: "filler"; }

export type CalCell = CalDay | CalFiller;

export interface Stats {
  goodDays: number;
  tracked: number;
  avgScore: number;
  bestStreak: number;
  topScore: number;
  topDate: Date | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function fmtKey(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function buildMonthData(year: number, month: number, apiDays: DayReport[]): Map<string, DayData> {
  const out = new Map<string, DayData>();
  const lookup = new Map(apiDays.map(d => [d.date, d]));
  const totalDays = new Date(year, month + 1, 0).getDate();

  for (let d = 1; d <= totalDays; d++) {
    const key = fmtKey(year, month, d);
    const src = lookup.get(key);
    out.set(key, src
      ? { score: src.score, habitsTotal: src.habits_total, habitsDone: src.habits_done, tasksTotal: src.tasks_total, tasksDone: src.tasks_done }
      : { score: null, habitsTotal: 0, habitsDone: 0, tasksTotal: 0, tasksDone: 0 },
    );
  }
  return out;
}

export function tierOf(score: number | null): ScoreTier {
  if (score === null || score <= 0) return "empty";
  if (score <= 20) return "poor";
  if (score <= 40) return "low";
  if (score <= 60) return "mid";
  if (score <= 80) return "good";
  return "great";
}

export function computeStats(data: Map<string, DayData>, year: number, month: number): Stats {
  const days = new Date(year, month + 1, 0).getDate();
  let goodDays = 0, tracked = 0, totalScore = 0;
  let streak = 0, best = 0, topScore = 0, topDay = 0;

  for (let d = 1; d <= days; d++) {
    const entry = data.get(fmtKey(year, month, d));
    if (!entry || entry.score === null) { streak = 0; continue; }
    tracked++;
    totalScore += entry.score;
    if (entry.score > topScore) { topScore = entry.score; topDay = d; }
    if (entry.score >= 60) { best = Math.max(best, ++streak); goodDays++; }
    else streak = 0;
  }

  return {
    goodDays, tracked,
    avgScore: tracked > 0 ? Math.round(totalScore / tracked) : 0,
    bestStreak: best,
    topScore,
    topDate: topDay > 0 ? new Date(year, month, topDay) : null,
  };
}

export function insightMsg(stats: Stats, month: number, year: number): string {
  const name = MONTH_NAMES[month];
  if (stats.tracked === 0)                    return `No data yet for ${name} ${year}. Navigate to a past month to see your performance summary.`;
  if (stats.bestStreak >= 7)                  return `A ${stats.bestStreak}-day streak in ${name} — that kind of sustained effort is where real change happens.`;
  if (stats.goodDays >= stats.tracked * 0.75) return `${stats.goodDays} of ${stats.tracked} tracked days were strong. ${name} is one of your most consistent months.`;
  if (stats.goodDays >= stats.tracked * 0.5)  return `More than half of ${name} has been productive. A few more consistent days will make this a standout month.`;
  return `Every tracked day adds up. Use ${name}'s patterns to spot where consistency slips — that's your growth edge.`;
}
