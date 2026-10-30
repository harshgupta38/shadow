import { useCallback, useEffect, useState } from "react";

import { api, ApiError } from "@/api";
import type { ExerciseSummary } from "@/api";

// The library is reference content that only changes on a new deploy, and three screens (the
// Exercises tab, the plan builder's picker, the live workout) all list it. Keep one copy per
// page load instead of refetching it each time one of them opens.
let cached: ExerciseSummary[] | null = null;
let inflight: Promise<ExerciseSummary[]> | null = null;

function fetchLibrary(force: boolean): Promise<ExerciseSummary[]> {
  if (!force && cached) return Promise.resolve(cached);
  if (!force && inflight) return inflight;
  inflight = api.workout
    .getExercises()
    .then((list) => {
      cached = list;
      return list;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useExerciseLibrary() {
  const [exercises, setExercises] = useState<ExerciseSummary[]>(cached ?? []);
  const [loading, setLoading] = useState(cached === null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      setExercises(await fetchLibrary(force));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load the exercise library right now.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { exercises, loading, error, reload: () => load(true) };
}
