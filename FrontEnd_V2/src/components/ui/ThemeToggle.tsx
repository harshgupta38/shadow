import { MoonStarsFill, SunFill } from "react-bootstrap-icons";

import { useTheme } from "@/context/ThemeContext";

const MODE_LABELS = {
    light: "Manual",
    dark: "Manual",
    browser: "Browser default",
    dynamic: "Dynamic",
} as const;

export function ThemeToggle() {
    const { effectiveTheme, themePreference, toggleTheme } = useTheme();
    const isDark = effectiveTheme === "dark";
    const nextTheme = isDark ? "light" : "dark";
    const modeLabel = MODE_LABELS[themePreference];

    return (
        <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={toggleTheme}
            aria-label={`Current theme: ${effectiveTheme}. ${modeLabel} mode. Switch to ${nextTheme} mode`}
            title={`${modeLabel} theme (${effectiveTheme})`}
            data-theme-preference={themePreference}
            data-theme-effective={effectiveTheme}
        >
            {isDark ? <MoonStarsFill size={18} /> : <SunFill size={18} />}
        </button>
    );
}