import { SunFill, MoonStarsFill } from "react-bootstrap-icons";
import { useTheme } from "@/context/ThemeContext";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      className="btn btn-ghost btn-icon"
      onClick={toggleTheme}
      aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
    >
      {theme === "light" ? <MoonStarsFill size={18} /> : <SunFill size={18} />}
    </button>
  );
}
