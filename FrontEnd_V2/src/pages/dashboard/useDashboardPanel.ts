import { useCallback, useState } from "react";

type PanelStatus = "loading" | "ready" | "error";

/**
 * Loads one dashboard panel on its own, so a slow or failed one never holds back the rest of the page. `load` should be a stable
 * function. It resolves to what the panel shows, or to null when the panel has nothing to show (the page then leaves it out).
 * Data already on screen stays when a refresh fails.
 */
export function useDashboardPanel<T>(load: () => Promise<T | null>) {
  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState<PanelStatus>("loading");

  const reload = useCallback(() => {
    load()
      .then((result) => {
        setData(result);
        setStatus("ready");
      })
      .catch(() => setStatus((current) => (current === "ready" ? current : "error")));
  }, [load]);

  const retry = useCallback(() => {
    setStatus("loading");
    reload();
  }, [reload]);

  return { data, status, reload, retry };
}
