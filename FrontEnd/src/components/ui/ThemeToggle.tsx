import { MoonStarsFill, SunFill } from "react-bootstrap-icons";

import { useTheme } from "@/context/ThemeContext";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      className="btn btn-ghost btn-icon"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
    >
      {isDark ? <SunFill size={18} /> : <MoonStarsFill size={18} />}
    </button>
  );
}
