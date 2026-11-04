import { useCallback, useEffect, useState } from "react";

import { api, ApiError } from "@/api";
import type { WarmUpRoutine } from "@/api";
import {
  freshProgress,
  readProgress,
  writeProgress,
  type WarmUpPhase,
  type WarmUpProgress,
} from "@/pages/workout/TodayTab/WarmUpCard/WarmUpCard.constants";

interface UseWarmUpOptions {
  /** False when there is nothing to warm up for: no plan day today, or the workout is already running or done. */
  enabled: boolean;
  planId: number | null;
  weekday: number | null;
  date: string; // today, "YYYY-MM-DD"
}

export type LoadState = "loading" | "error" | "ready";

export interface WarmUpController {
  enabled: boolean;
  loadState: LoadState;
  error: string | null;
  routine: WarmUpRoutine | null;
  phase: WarmUpPhase;
  doneIds: number[];
  startedAt: number | null;
  finishedAt: number | null;
  /** The warm-up is worth doing and hasn't been done or skipped, so starting the workout should check first. */
  pending: boolean;
  start: () => void;
  toggle: (exerciseId: number) => void;
  /** Ends the warm-up as done, even with exercises left unticked. */
  finish: () => void;
  /** Goes ahead without a warm-up today; any progress is thrown away. */
  skip: () => void;
  /** Back to the start, ready to warm up from scratch. */
  reset: () => void;
  retry: () => void;
}

export function useWarmUp({ enabled, planId, weekday, date }: UseWarmUpOptions): WarmUpController {
  const dayKey = planId !== null && weekday !== null ? `${planId}:${weekday}` : null;

  const [routine, setRoutine] = useState<WarmUpRoutine | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [saved, setSaved] = useState<WarmUpProgress | null>(null);

  // Picks up where this day left off, and starts over when the day or the plan day changes.
  useEffect(() => {
    setSaved(dayKey === null ? null : readProgress(date, dayKey));
  }, [date, dayKey]);

  useEffect(() => {
    if (!enabled || planId === null || weekday === null) return;
    let current = true;
    setLoadState("loading");
    setError(null);
    api.workout
      .getPlanDayWarmUpRoutine(planId, weekday)
      .then((result) => {
        if (!current) return;
        setRoutine(result);
        setLoadState("ready");
      })
      .catch((err) => {
        if (!current) return;
        setError(err instanceof ApiError ? err.message : "Could not load your warm-up right now.");
        setLoadState("error");
      });
    return () => {
      current = false;
    };
  }, [enabled, planId, weekday, attempt]);

  const progress = saved !== null && saved.dayKey === dayKey && saved.date === date ? saved : freshProgress(date, dayKey ?? "");

  const commit = useCallback((next: WarmUpProgress) => {
    setSaved(next);
    writeProgress(next);
  }, []);

  const start = useCallback(() => {
    if (dayKey === null) return;
    commit({ ...freshProgress(date, dayKey), phase: "active", startedAt: Date.now() });
  }, [commit, date, dayKey]);

  const toggle = useCallback(
    (exerciseId: number) => {
      if (dayKey === null || routine === null || progress.phase !== "active") return;
      const doneIds = progress.doneIds.includes(exerciseId)
        ? progress.doneIds.filter((id) => id !== exerciseId)
        : [...progress.doneIds, exerciseId];
      const allDone = routine.items.every((item) => doneIds.includes(item.exercise.id));
      commit({ ...progress, doneIds, phase: allDone ? "done" : "active", finishedAt: allDone ? Date.now() : null });
    },
    [commit, dayKey, progress, routine],
  );

  const finish = useCallback(() => {
    if (dayKey === null || progress.phase !== "active") return;
    commit({ ...progress, phase: "done", finishedAt: Date.now() });
  }, [commit, dayKey, progress]);

  const skip = useCallback(() => {
    if (dayKey === null) return;
    commit({ ...freshProgress(date, dayKey), phase: "skipped" });
  }, [commit, date, dayKey]);

  const reset = useCallback(() => {
    if (dayKey === null) return;
    commit(freshProgress(date, dayKey));
  }, [commit, date, dayKey]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const hasItems = loadState === "ready" && routine !== null && routine.items.length > 0;

  return {
    enabled,
    loadState,
    error,
    routine,
    phase: progress.phase,
    doneIds: progress.doneIds,
    startedAt: progress.startedAt,
    finishedAt: progress.finishedAt,
    pending: enabled && hasItems && (progress.phase === "idle" || progress.phase === "active"),
    start,
    toggle,
    finish,
    skip,
    reset,
    retry,
  };
}
