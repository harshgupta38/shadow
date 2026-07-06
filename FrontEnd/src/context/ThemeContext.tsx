import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { ApiError, api, type ThemePreference } from "@/api";

const THEME_STORAGE_KEY = "shadow.theme";
type EffectiveTheme = Exclude<ThemePreference, "browser" | "dynamic">;

interface ThemeContextValue {
  theme: EffectiveTheme;
  themePreference: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function resolveSystemTheme(): EffectiveTheme {
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

function resolveInitialThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "browser" || stored === "dynamic" || stored === "light" || stored === "dark") {
      return stored;
    }
  } catch {
    /* ignore */
  }
  return "browser";
}

function applyTheme(theme: EffectiveTheme): void {
  document.documentElement.setAttribute("data-bs-theme", theme);
  document.documentElement.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themePreference, setThemePreference] = useState<ThemePreference>(
    resolveInitialThemePreference,
  );
  const [systemTheme, setSystemTheme] = useState<EffectiveTheme>(resolveSystemTheme);
  const [dynamicTheme, setDynamicTheme] = useState<EffectiveTheme>(resolveSystemTheme);
  const [dynamicFallbackToBrowser, setDynamicFallbackToBrowser] = useState(false);
  const dynamicTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      setSystemTheme(mediaQuery.matches ? "dark" : "light");
    };

    handleChange();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  const clearDynamicTimer = useCallback(() => {
    if (dynamicTimerRef.current == null) return;
    window.clearTimeout(dynamicTimerRef.current);
    dynamicTimerRef.current = null;
  }, []);

  const scheduleDynamicRefresh = useCallback(
    (nextTransitionAt: string | null | undefined) => {
      clearDynamicTimer();

      if (!nextTransitionAt) return;
      const parsed = Date.parse(nextTransitionAt);
      if (Number.isNaN(parsed)) return;

      const delayMs = Math.max(60_000, parsed - Date.now() + 5_000);
      dynamicTimerRef.current = window.setTimeout(() => {
        if (themePreference === "dynamic") {
          void resolveDynamicTheme();
        }
      }, delayMs);
    },
    [clearDynamicTimer, themePreference],
  );

  const resolveDynamicTheme = useCallback(async (): Promise<void> => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setDynamicFallbackToBrowser(true);
      clearDynamicTimer();
      return;
    }

    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        maximumAge: 10 * 60 * 1000,
        timeout: 7_000,
      });
    }).catch(() => null);

    if (!position) {
      setDynamicFallbackToBrowser(true);
      clearDynamicTimer();
      return;
    }

    try {
      const resolved = await api.settings.resolveDynamicAppearance(
        position.coords.latitude,
        position.coords.longitude,
      );
      setDynamicFallbackToBrowser(false);
      setDynamicTheme(resolved.effective_theme);
      scheduleDynamicRefresh(resolved.next_transition_at);
    } catch (err) {
      // Dynamic should degrade to Browser Default on lookup failure.
      if (err instanceof ApiError) {
        setDynamicFallbackToBrowser(true);
      } else {
        setDynamicFallbackToBrowser(true);
      }
      clearDynamicTimer();
    }
  }, [clearDynamicTimer, scheduleDynamicRefresh]);

  useEffect(() => {
    if (themePreference !== "dynamic") {
      clearDynamicTimer();
      return;
    }

    void resolveDynamicTheme();
    return () => {
      clearDynamicTimer();
    };
  }, [clearDynamicTimer, resolveDynamicTheme, themePreference]);

  const theme = useMemo<EffectiveTheme>(
    () =>
      themePreference === "browser"
        ? systemTheme
        : themePreference === "dynamic"
          ? dynamicFallbackToBrowser
            ? systemTheme
            : dynamicTheme
          : themePreference,
    [dynamicFallbackToBrowser, dynamicTheme, systemTheme, themePreference],
  );

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, themePreference);
    } catch {
      /* ignore */
    }
  }, [theme, themePreference]);

  const setTheme = useCallback((next: ThemePreference) => setThemePreference(next), []);
  const toggleTheme = useCallback(
    () =>
      setThemePreference((prev) => {
        const resolved = prev === "browser" ? systemTheme : prev;
        return resolved === "dark" ? "light" : "dark";
      }),
    [systemTheme],
  );

  const value = useMemo(
    () => ({ theme, themePreference, setTheme, toggleTheme }),
    [theme, themePreference, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
