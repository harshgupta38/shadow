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

import {
  ApiError,
  api,
  type DynamicAppearanceResolveResponse,
  type ThemePreference,
} from "@/api";
import { useToast } from "./ToastContext";

const THEME_STORAGE_KEY = "shadow.theme";
const PREVIOUS_THEME_STORAGE_KEY = "shadow.theme.previous";
const DYNAMIC_POLL_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_IST_SUNRISE_MINUTES = 6 * 60;
const DEFAULT_IST_SUNSET_MINUTES = 18 * 60 + 30;
const IST_OFFSET_MINUTES = 5 * 60 + 30;
type EffectiveTheme = Exclude<ThemePreference, "browser" | "dynamic">;
type NonDynamicThemePreference = Exclude<ThemePreference, "dynamic">;
type DynamicCoordinates = { latitude: number; longitude: number };

type DynamicThemeLiveSource = Exclude<DynamicAppearanceResolveResponse["source"], "default_ist">;

export interface DynamicThemeInfo {
  mode: "unknown" | "live" | "default_permission" | "default_backend";
  source: DynamicAppearanceResolveResponse["source"] | null;
  sunrise: string | null;
  sunset: string | null;
  nextTransitionAt: string | null;
  timezone: string | null;
}

interface ThemeContextValue {
  theme: EffectiveTheme;
  themePreference: ThemePreference;
  dynamicThemeInfo: DynamicThemeInfo;
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

function resolveInitialPreviousThemePreference(): NonDynamicThemePreference {
  try {
    const stored = localStorage.getItem(PREVIOUS_THEME_STORAGE_KEY);
    if (stored === "browser" || stored === "light" || stored === "dark") {
      return stored;
    }
  } catch {
    /* ignore */
  }
  return "browser";
}

function readStoredDynamicCoordinates(): DynamicCoordinates | null {
  try {
    const raw = localStorage.getItem("shadow.dynamic.coords");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DynamicCoordinates>;

    const latitude = Number(parsed.latitude);
    const longitude = Number(parsed.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    if (latitude < -90 || latitude > 90) return null;
    if (longitude < -180 || longitude > 180) return null;

    return { latitude, longitude };
  } catch {
    return null;
  }
}

function storeDynamicCoordinates(coords: DynamicCoordinates): void {
  try {
    localStorage.setItem("shadow.dynamic.coords", JSON.stringify(coords));
  } catch {
    /* ignore */
  }
}

function applyTheme(theme: EffectiveTheme): void {
  document.documentElement.setAttribute("data-bs-theme", theme);
  document.documentElement.style.colorScheme = theme;
}

function resolveDefaultIstTheme(now: Date = new Date()): EffectiveTheme {
  const istTimestampMs = now.getTime() + IST_OFFSET_MINUTES * 60 * 1000;
  const istDate = new Date(istTimestampMs);
  const minutesSinceMidnight = istDate.getUTCHours() * 60 + istDate.getUTCMinutes();

  return minutesSinceMidnight >= DEFAULT_IST_SUNRISE_MINUTES &&
    minutesSinceMidnight < DEFAULT_IST_SUNSET_MINUTES
    ? "light"
    : "dark";
}

function createUnknownDynamicThemeInfo(): DynamicThemeInfo {
  return {
    mode: "unknown",
    source: null,
    sunrise: null,
    sunset: null,
    nextTransitionAt: null,
    timezone: null,
  };
}

function createPermissionFallbackDynamicThemeInfo(): DynamicThemeInfo {
  return {
    mode: "default_permission",
    source: "default_ist",
    sunrise: null,
    sunset: null,
    nextTransitionAt: null,
    timezone: "Asia/Kolkata",
  };
}

function createResolvedDynamicThemeInfo(
  resolved: DynamicAppearanceResolveResponse,
): DynamicThemeInfo {
  if (resolved.source === "default_ist") {
    return {
      mode: "default_backend",
      source: resolved.source,
      sunrise: resolved.sunrise,
      sunset: resolved.sunset,
      nextTransitionAt: resolved.next_transition_at,
      timezone: resolved.timezone,
    };
  }

  return {
    mode: "live",
    source: resolved.source as DynamicThemeLiveSource,
    sunrise: resolved.sunrise,
    sunset: resolved.sunset,
    nextTransitionAt: resolved.next_transition_at,
    timezone: resolved.timezone,
  };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [themePreference, setThemePreference] = useState<ThemePreference>(
    resolveInitialThemePreference,
  );
  const [previousThemePreference, setPreviousThemePreference] =
    useState<NonDynamicThemePreference>(resolveInitialPreviousThemePreference);
  const [systemTheme, setSystemTheme] = useState<EffectiveTheme>(resolveSystemTheme);
  const [dynamicTheme, setDynamicTheme] = useState<EffectiveTheme>(resolveSystemTheme);
  const [dynamicPermissionDenied, setDynamicPermissionDenied] = useState(false);
  const [dynamicThemeInfo, setDynamicThemeInfo] = useState<DynamicThemeInfo>(
    createUnknownDynamicThemeInfo,
  );
  const dynamicPollIntervalRef = useRef<number | null>(null);
  const dynamicResolveInFlightRef = useRef<Promise<void> | null>(null);
  const dynamicPermissionToastShownRef = useRef(false);

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

  const clearDynamicPoll = useCallback(() => {
    if (dynamicPollIntervalRef.current == null) return;
    window.clearInterval(dynamicPollIntervalRef.current);
    dynamicPollIntervalRef.current = null;
  }, []);

  const resolveDynamicTheme = useCallback(async (): Promise<void> => {
    if (dynamicResolveInFlightRef.current) {
      return dynamicResolveInFlightRef.current;
    }

    let inFlight: Promise<void> | null = null;

    const run = async () => {
      const storedCoordinates = readStoredDynamicCoordinates();

      if (typeof window === "undefined" || !navigator.geolocation) {
        if (storedCoordinates) {
          try {
            const resolved = await api.settings.resolveDynamicAppearance(
              storedCoordinates.latitude,
              storedCoordinates.longitude,
            );
            setDynamicPermissionDenied(false);
            dynamicPermissionToastShownRef.current = false;
            setDynamicThemeInfo(createResolvedDynamicThemeInfo(resolved));
            setDynamicTheme(resolved.effective_theme);
          } catch {
            // Keep current theme and retry on next poll.
          }
          return;
        }

        setDynamicPermissionDenied(true);
        setDynamicThemeInfo(createPermissionFallbackDynamicThemeInfo());
        if (!dynamicPermissionToastShownRef.current) {
          toast.info("Dynamic theme needs location permission. Using default Indian sunrise/sunset timings.");
          dynamicPermissionToastShownRef.current = true;
        }
        return;
      }

      const positionResult = await new Promise<{
        position: GeolocationPosition | null;
        error: GeolocationPositionError | null;
      }>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (position) => resolve({ position, error: null }),
          (error) => resolve({ position: null, error }),
          {
            enableHighAccuracy: false,
            maximumAge: 10 * 60 * 1000,
            timeout: 7_000,
          },
        );
      });

      if (
        positionResult.error?.code === positionResult.error?.PERMISSION_DENIED
      ) {
        setDynamicPermissionDenied(true);
        setDynamicThemeInfo(createPermissionFallbackDynamicThemeInfo());
        if (!dynamicPermissionToastShownRef.current) {
          toast.info("Dynamic theme needs location permission. Using default Indian sunrise/sunset timings.");
          dynamicPermissionToastShownRef.current = true;
        }
        return;
      }

      let coordinates: DynamicCoordinates | null;
      if (positionResult.position) {
        coordinates = {
          latitude: positionResult.position.coords.latitude,
          longitude: positionResult.position.coords.longitude,
        };
        storeDynamicCoordinates(coordinates);
      } else {
        coordinates = storedCoordinates;
      }

      if (!coordinates) {
        setDynamicPermissionDenied(true);
        setDynamicThemeInfo(createPermissionFallbackDynamicThemeInfo());
        if (!dynamicPermissionToastShownRef.current) {
          toast.info("Dynamic theme needs location permission. Using default Indian sunrise/sunset timings.");
          dynamicPermissionToastShownRef.current = true;
        }
        return;
      }

      try {
        const resolved = await api.settings.resolveDynamicAppearance(
          coordinates.latitude,
          coordinates.longitude,
        );
        setDynamicPermissionDenied(false);
        dynamicPermissionToastShownRef.current = false;
        setDynamicThemeInfo(createResolvedDynamicThemeInfo(resolved));
        setDynamicTheme(resolved.effective_theme);
      } catch (err) {
        // Backend handles layered fallbacks (Open-Meteo -> Sunrise-Sunset -> default IST).
        // If request still fails (e.g. offline), keep the current effective theme.
        if (err instanceof ApiError && err.status === 403) {
          setDynamicPermissionDenied(true);
          setDynamicThemeInfo(createPermissionFallbackDynamicThemeInfo());
        }
      }
    };

    inFlight = run().finally(() => {
      if (dynamicResolveInFlightRef.current === inFlight) {
        dynamicResolveInFlightRef.current = null;
      }
    });
    dynamicResolveInFlightRef.current = inFlight;
    return inFlight;
  }, [toast]);

  useEffect(() => {
    if (themePreference !== "dynamic") {
      clearDynamicPoll();
      return;
    }

    void resolveDynamicTheme();
    clearDynamicPoll();
    dynamicPollIntervalRef.current = window.setInterval(() => {
      void resolveDynamicTheme();
    }, DYNAMIC_POLL_INTERVAL_MS);

    return () => {
      clearDynamicPoll();
    };
  }, [clearDynamicPoll, resolveDynamicTheme, themePreference]);

  useEffect(() => {
    if (themePreference !== "dynamic") return;

    const handleOnline = () => {
      void resolveDynamicTheme();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void resolveDynamicTheme();
      }
    };

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [resolveDynamicTheme, themePreference]);

  const theme = useMemo<EffectiveTheme>(
    () =>
      themePreference === "browser"
        ? systemTheme
        : themePreference === "dynamic"
          ? dynamicPermissionDenied
            ? resolveDefaultIstTheme()
            : dynamicTheme
          : themePreference,
    [dynamicPermissionDenied, dynamicTheme, previousThemePreference, systemTheme, themePreference],
  );

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, themePreference);
    } catch {
      /* ignore */
    }
  }, [theme, themePreference]);

  useEffect(() => {
    try {
      localStorage.setItem(PREVIOUS_THEME_STORAGE_KEY, previousThemePreference);
    } catch {
      /* ignore */
    }
  }, [previousThemePreference]);

  const setTheme = useCallback(
    (next: ThemePreference) => {
      if (next !== "dynamic") {
        setPreviousThemePreference(next);
        setDynamicPermissionDenied(false);
        setDynamicThemeInfo(createUnknownDynamicThemeInfo());
        dynamicPermissionToastShownRef.current = false;
      }

      setThemePreference(next);

      if (next === "dynamic") {
        void resolveDynamicTheme();
      }
    },
    [resolveDynamicTheme],
  );
  const toggleTheme = useCallback(
    () => {
      setTheme(theme === "dark" ? "light" : "dark");
    },
    [setTheme, theme],
  );

  const value = useMemo(
    () => ({ theme, themePreference, dynamicThemeInfo, setTheme, toggleTheme }),
    [dynamicThemeInfo, theme, themePreference, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
