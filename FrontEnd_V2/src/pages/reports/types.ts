export type ScoreTier = "empty" | "poor" | "low" | "mid" | "good" | "great";

export interface DayData {
  score: number | null;
  alignmentScore: number | null;
  habitsTotal: number;
  habitsDone: number;
  tasksTotal: number;
  tasksDone: number;
  scheduleTotal: number;
  scheduleDone: number;
  hasDailyReport: boolean;
  hasWeeklyReport: boolean;
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
