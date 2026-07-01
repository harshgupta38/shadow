import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "@/api";

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Re-run the loader. */
  reload: () => void;
  /** Optimistically replace the cached data. */
  setData: (updater: T | ((prev: T | null) => T | null)) => void;
}

/**
 * Loads async data on mount (and when `deps` change), tracking loading/error
 * state. Keeps pages free of repetitive try/catch/loading boilerplate.
 */
export function useAsync<T>(
  loader: () => Promise<T>,
  deps: unknown[] = [],
): AsyncState<T> {
  const [data, setDataState] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Keep the latest loader without forcing it into the dependency array.
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    loaderRef
      .current()
      .then((result) => {
        if (active && mounted.current) setDataState(result);
      })
      .catch((err) => {
        if (!active || !mounted.current) return;
        setError(err instanceof ApiError ? err.message : "Something went wrong.");
      })
      .finally(() => {
        if (active && mounted.current) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, ...deps]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const setData = useCallback((updater: T | ((prev: T | null) => T | null)) => {
    setDataState((prev) =>
      typeof updater === "function" ? (updater as (p: T | null) => T | null)(prev) : updater,
    );
  }, []);

  return { data, loading, error, reload, setData };
}
