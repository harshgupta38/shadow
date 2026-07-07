import { MoonStarsFill, SunFill } from "react-bootstrap-icons";

import { useTheme } from "@/context/ThemeContext";

export function ThemeToggle() {
  const { theme, themePreference, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const nextTheme = isDark ? "light" : "dark";
  const modeLabel =
    themePreference === "dynamic"
      ? "Dynamic"
      : themePreference === "browser"
        ? "Browser default"
        : "Manual";

  return (
    <button
      type="button"
      className="btn btn-ghost btn-icon"
      onClick={toggleTheme}
      aria-label={`Current theme: ${theme}. ${modeLabel} mode. Switch to ${nextTheme} mode`}
      title={`${modeLabel} theme (${theme})`}
      data-theme-preference={themePreference}
      data-theme-effective={theme}
    >
      {isDark ? <MoonStarsFill size={18} /> : <SunFill size={18} />}
    </button>
  );
}
