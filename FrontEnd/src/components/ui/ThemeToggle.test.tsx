import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useTheme } from "@/context/ThemeContext";

import { ThemeToggle } from "./ThemeToggle";

vi.mock("@/context/ThemeContext", () => ({
  useTheme: vi.fn(),
}));

const mockedUseTheme = vi.mocked(useTheme);

function mockThemeState(
  theme: "light" | "dark",
  themePreference: "browser" | "dynamic" | "light" | "dark",
  toggleTheme: ReturnType<typeof vi.fn>,
) {
  mockedUseTheme.mockReturnValue({
    theme,
    themePreference,
    setTheme: vi.fn(),
    toggleTheme,
    dynamicThemeInfo: {
      mode: "idle",
      source: null,
      sunrise: null,
      sunset: null,
      nextTransitionAt: null,
      timezone: null,
    },
  } as ReturnType<typeof useTheme>);
}

describe("ThemeToggle", () => {
  let toggleThemeSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    toggleThemeSpy = vi.fn();
    mockedUseTheme.mockReset();
  });

  it("reflects active dynamic theme state in navbar labels", () => {
    mockThemeState("light", "dynamic", toggleThemeSpy);
    const { rerender } = render(<ThemeToggle />);

    let button = screen.getByRole("button");
    expect(button).toHaveAttribute("data-theme-preference", "dynamic");
    expect(button).toHaveAttribute("data-theme-effective", "light");
    expect(button).toHaveAttribute("title", "Dynamic theme (light)");
    expect(button).toHaveAttribute("aria-label", "Current theme: light. Dynamic mode. Switch to dark mode");

    mockThemeState("dark", "dynamic", toggleThemeSpy);
    rerender(<ThemeToggle />);

    button = screen.getByRole("button");
    expect(button).toHaveAttribute("data-theme-effective", "dark");
    expect(button).toHaveAttribute("title", "Dynamic theme (dark)");
    expect(button).toHaveAttribute("aria-label", "Current theme: dark. Dynamic mode. Switch to light mode");
  });

  it("triggers theme toggle on click", async () => {
    const user = userEvent.setup();
    mockThemeState("dark", "browser", toggleThemeSpy);

    render(<ThemeToggle />);
    await user.click(screen.getByRole("button"));

    expect(toggleThemeSpy).toHaveBeenCalledTimes(1);
  });
});
