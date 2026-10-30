import type {
  WeeklyHabitDayState,
  WeeklyMissedItem,
  WeeklyPriorityId,
  WeeklyTimeSlotId,
} from "@/api/types";

export const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

export const SLOT_LABEL: Record<WeeklyTimeSlotId, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  night: "Night",
};

export const PRIORITY_LABEL: Record<WeeklyPriorityId, string> = {
  highest: "Highest",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const HABIT_STATE_LABEL: Record<WeeklyHabitDayState, string> = {
  done: "Done",
  missed: "Missed",
  skipped: "Skipped (excused)",
  none: "Not planned",
};

export const MISSED_KIND_LABEL: Record<WeeklyMissedItem["kind"], string> = {
  habit: "Habit",
  task: "Task",
  schedule: "Scheduled",
};

// Cut-offs behind the computed callouts and tags.
export const THRESHOLDS = {
  STRONG_DAY_PCT: 70,
  CONSISTENT_HABIT_PCT: 80,
  SLIPPED_HABIT_DELTA_PTS: -10,
  PRIORITY_GAP_PTS: 10,
  PRIORITY_GOOD_PCT: 80,
  // Slots with fewer planned items than this are too thin to call strongest or weakest.
  MIN_SLOT_SAMPLE: 10,
  // Past this many habits the table collapses to the strongest and weakest few.
  HABITS_COLLAPSE_ABOVE: 8,
  HABITS_SHOWN_PER_END: 4,
} as const;

export const SPARK_SIZE = {
  TREND: { width: 240, height: 64 },
  GOAL: { width: 120, height: 40 },
} as const;

export function pct(done: number, total: number): number | null {
  return total > 0 ? Math.round((done / total) * 100) : null;
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/** Adds whole days to a "YYYY-MM-DD" string without any timezone drift. */
export function shiftIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10);
}
