import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { api, ApiError, type SettingsRead } from "@/api";
import { setRuntimeFormatPreferences } from "@/lib/format";

import { useAuth } from "./AuthContext";

export const SETTINGS_UPDATED_EVENT = "shadow:settings-updated";

export interface SettingsUpdatedEventDetail {
  settings: SettingsRead;
}

interface RuntimeSettingsContextValue {
  settings: SettingsRead | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  replaceSettings: (settings: SettingsRead) => void;
}

const RuntimeSettingsContext = createContext<RuntimeSettingsContextValue | undefined>(
  undefined,
);

function applyRuntimePreferences(settings: SettingsRead | null): void {
  if (settings) {
    setRuntimeFormatPreferences({
      dateFormat: settings.planner.date_format,
      timeFormat: settings.planner.time_format,
      weekStartsOn: settings.planner.week_starts_on,
    });
  } else {
    setRuntimeFormatPreferences(null);
  }

  if (typeof document === "undefined") return;

  const root = document.documentElement;
  const accessibility = settings?.accessibility;

  if (accessibility?.reduced_motion) {
    root.setAttribute("data-reduced-motion", "true");
  } else {
    root.removeAttribute("data-reduced-motion");
  }

  if (accessibility?.high_contrast) {
    root.setAttribute("data-high-contrast", "true");
  } else {
    root.removeAttribute("data-high-contrast");
  }

  const fontScalePercent = accessibility?.font_scale_percent ?? 100;
  root.style.fontSize = `${fontScalePercent}%`;
}

export function emitRuntimeSettingsUpdated(settings: SettingsRead): void {
  window.dispatchEvent(
    new CustomEvent<SettingsUpdatedEventDetail>(SETTINGS_UPDATED_EVENT, {
      detail: { settings },
    }),
  );
}

export function RuntimeSettingsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, status } = useAuth();
  const [settings, setSettings] = useState<SettingsRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (status === "loading") return;

    if (!isAuthenticated) {
      setSettings(null);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    api.settings
      .get()
      .then((result) => {
        if (!active) return;
        setSettings(result);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Couldn't load runtime settings.",
        );
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isAuthenticated, reloadToken, status]);

  useEffect(() => {
    applyRuntimePreferences(settings);
  }, [settings]);

  useEffect(() => {
    function onSettingsUpdated(event: Event) {
      const customEvent = event as CustomEvent<SettingsUpdatedEventDetail>;
      if (!customEvent.detail?.settings) return;
      setSettings(customEvent.detail.settings);
    }

    window.addEventListener(SETTINGS_UPDATED_EVENT, onSettingsUpdated as EventListener);
    return () =>
      window.removeEventListener(SETTINGS_UPDATED_EVENT, onSettingsUpdated as EventListener);
  }, []);

  const reload = useCallback(() => {
    setReloadToken((prev) => prev + 1);
  }, []);

  const replaceSettings = useCallback((next: SettingsRead) => {
    setSettings(next);
  }, []);

  const value = useMemo<RuntimeSettingsContextValue>(
    () => ({ settings, loading, error, reload, replaceSettings }),
    [settings, loading, error, reload, replaceSettings],
  );

  return (
    <RuntimeSettingsContext.Provider value={value}>
      {children}
    </RuntimeSettingsContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useRuntimeSettings(): RuntimeSettingsContextValue {
  const ctx = useContext(RuntimeSettingsContext);
  if (!ctx) {
    throw new Error(
      "useRuntimeSettings must be used within a RuntimeSettingsProvider",
    );
  }
  return ctx;
}
