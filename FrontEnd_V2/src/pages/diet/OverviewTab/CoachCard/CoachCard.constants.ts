import type { DietCoachMeal, DietCoachResult } from "@/api";
import { TIMING } from "@/constant/tuning";
import { todayIso } from "@/services/date.service";

/** The last meal ideas, kept in the browser so they are still there when the user comes back to the page. */
export interface SavedCoach {
  /** When the ideas arrived (ms since epoch). They are dropped TIMING.DIET_COACH_KEEP_MS later, or when new ones are asked for. */
  savedAt: number;
  /** The IST day they were made for: they are built from that day's remaining targets. */
  day: string;
  meal: "auto" | DietCoachMeal;
  note: string;
  result: DietCoachResult;
  shown: string[];
  added: string[];
}

// Each account keeps its own, so a second person using this browser never sees someone else's ideas.
const storageKey = (userId: number) => `shadow.diet.coach.${userId}`;

/** Milliseconds left before ideas that arrived at `savedAt` are dropped. */
export function coachExpiresIn(savedAt: number, now = Date.now()): number {
  return savedAt + TIMING.DIET_COACH_KEEP_MS - now;
}

/** The saved ideas if they are still fresh and still for today; otherwise nothing, and the stale copy is removed. */
export function readSavedCoach(userId: number): SavedCoach | null {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const saved = JSON.parse(raw) as SavedCoach;
    const valid = saved && typeof saved.savedAt === "number" && saved.result && Array.isArray(saved.result.ideas);
    if (valid && coachExpiresIn(saved.savedAt) > 0 && saved.day === todayIso()) return saved;
    localStorage.removeItem(storageKey(userId));
  } catch {
    /* storage unavailable or unreadable: the page simply starts empty */
  }
  return null;
}

export function writeSavedCoach(userId: number, saved: SavedCoach): void {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(saved));
  } catch {
    /* private window or full storage: the ideas just are not kept */
  }
}

export function clearSavedCoach(userId: number): void {
  try {
    localStorage.removeItem(storageKey(userId));
  } catch {
    /* nothing to clear */
  }
}
