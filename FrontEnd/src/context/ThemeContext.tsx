import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { ThemePreference } from "@/api";

export type ThemeMode = "light" | "dark" | "system";

const THEME_STORAGE_KEY = "shadow.theme";

interface ThemeContextValue {
  /** The user's chosen mode (may be "system"). */
  mode: ThemeMode;
  /** The effective, resolved theme actually applied to the document. */
  theme: ThemePreference;
  setMode: (mode: ThemeMode) => void;
  /** Back-compat: set a concrete light/dark theme (used on login sync). */
  setTheme: (theme: ThemePreference) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function systemTheme(): ThemePreference {
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

function resolveInitialMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    /* ignore */
  }
  return "system";
}

function applyTheme(theme: ThemePreference): void {
  document.documentElement.setAttribute("data-bs-theme", theme);
  document.documentElement.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(resolveInitialMode);
  const [theme, setEffectiveTheme] = useState<ThemePreference>(() => {
    const initial = resolveInitialMode();
    return initial === "system" ? systemTheme() : initial;
  });

  // Resolve the effective theme from the mode, persist the mode, and follow the
  // OS preference while in "system" mode.
  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }

    if (mode !== "system") {
      setEffectiveTheme(mode);
      return;
    }

    setEffectiveTheme(systemTheme());
    if (typeof window !== "undefined" && window.matchMedia) {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => setEffectiveTheme(mq.matches ? "dark" : "light");
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [mode]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setMode = useCallback((next: ThemeMode) => setModeState(next), []);
  const setTheme = useCallback((next: ThemePreference) => setModeState(next), []);
  const toggleTheme = useCallback(
    () => setModeState(theme === "dark" ? "light" : "dark"),
    [theme],
  );

  const value = useMemo(
    () => ({ mode, theme, setMode, setTheme, toggleTheme }),
    [mode, theme, setMode, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
