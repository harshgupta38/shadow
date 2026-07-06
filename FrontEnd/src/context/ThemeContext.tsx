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

const THEME_STORAGE_KEY = "shadow.theme";
type EffectiveTheme = Exclude<ThemePreference, "browser">;

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
    if (stored === "browser" || stored === "light" || stored === "dark") return stored;
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

  const theme = useMemo<EffectiveTheme>(
    () => (themePreference === "browser" ? systemTheme : themePreference),
    [systemTheme, themePreference],
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
