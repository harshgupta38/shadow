import type { WarmUpItem } from "@/api/types";

export type WarmUpPhase = "idle" | "active" | "done" | "skipped";

/** How far today's warm-up has got. Kept in the browser so a refresh or a trip to another tab doesn't lose it. */
export interface WarmUpProgress {
  date: string; // the day it belongs to, "YYYY-MM-DD"
  dayKey: string; // which plan day, "planId:weekday"
  phase: WarmUpPhase;
  startedAt: number | null; // epoch ms
  finishedAt: number | null; // epoch ms
  doneIds: number[]; // exercises ticked off
}

const STORAGE_KEY = "shadow.workout.warmup";
const PHASES: WarmUpPhase[] = ["idle", "active", "done", "skipped"];

export const freshProgress = (date: string, dayKey: string): WarmUpProgress => ({
  date,
  dayKey,
  phase: "idle",
  startedAt: null,
  finishedAt: null,
  doneIds: [],
});

const isEpoch = (value: unknown): value is number | null => value === null || (typeof value === "number" && Number.isFinite(value));

/** The saved progress for this day, or a fresh start when nothing was saved, it is for another day, or storage is unavailable. */
export function readProgress(date: string, dayKey: string): WarmUpProgress {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (parsed !== null && typeof parsed === "object") {
      const saved = parsed as Partial<WarmUpProgress>;
      if (
        saved.date === date &&
        saved.dayKey === dayKey &&
        PHASES.includes(saved.phase as WarmUpPhase) &&
        isEpoch(saved.startedAt) &&
        isEpoch(saved.finishedAt) &&
        Array.isArray(saved.doneIds) &&
        saved.doneIds.every((id) => typeof id === "number")
      ) {
        return saved as WarmUpProgress;
      }
    }
  } catch {
    // Storage blocked or holding something unreadable: start over.
  }
  return freshProgress(date, dayKey);
}

export function writeProgress(progress: WarmUpProgress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // The warm-up still works for this visit without it.
  }
}

/** "5 min", "10 reps", "20 sec", or "3 × 30 sec" when it is done in sets. */
export function warmUpDose(item: WarmUpItem): string {
  return item.sets > 1 && item.exercise.measure !== "minutes" ? `${item.sets} × ${item.reps}` : item.reps;
}
