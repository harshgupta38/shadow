import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/api";

import { ThemeProvider, useTheme } from "./ThemeContext";
import { ToastProvider } from "./ToastContext";

vi.mock("@/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      settings: {
        ...actual.api.settings,
        resolveDynamicAppearance: vi.fn(),
      },
    },
  };
});

const mockedSettingsApi = api.settings as unknown as {
  resolveDynamicAppearance: ReturnType<typeof vi.fn>;
};

const localStorageStore = new Map<string, string>();

const localStorageMock = {
  getItem: vi.fn((key: string) => localStorageStore.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageStore.set(key, value);
  }),
  removeItem: vi.fn((key: string) => {
    localStorageStore.delete(key);
  }),
  clear: vi.fn(() => {
    localStorageStore.clear();
  }),
};

function seedDynamicCoordinates() {
  try {
    window.localStorage.setItem(
      "shadow.dynamic.coords",
      JSON.stringify({ latitude: 28.6139, longitude: 77.209 }),
    );
  } catch {
    // localStorage can be unavailable in some Node runtime configs.
  }
}

function resolveExpectedIstTheme(now: Date = new Date()): "light" | "dark" {
  const istTimestampMs = now.getTime() + (5 * 60 + 30) * 60 * 1000;
  const istDate = new Date(istTimestampMs);
  const minutesSinceMidnight = istDate.getUTCHours() * 60 + istDate.getUTCMinutes();
  return minutesSinceMidnight >= 6 * 60 && minutesSinceMidnight < 18 * 60 + 30
    ? "light"
    : "dark";
}

function ThemeConsumer() {
  const { theme, setTheme, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button type="button" onClick={() => setTheme("dynamic")}>
        dynamic
      </button>
      <button type="button" onClick={toggleTheme}>
        toggle
      </button>
    </div>
  );
}

function renderConsumer() {
  return render(
    <ToastProvider>
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    </ToastProvider>,
  );
}

describe("ThemeContext dynamic mode", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      value: localStorageMock,
      configurable: true,
    });

    localStorageStore.clear();
    mockedSettingsApi.resolveDynamicAppearance.mockReset();
    window.localStorage.clear();

    Object.defineProperty(navigator, "geolocation", {
      value: undefined,
      configurable: true,
    });
  });

  it("resolves dynamic mode via backend and applies effective theme", async () => {
    const user = userEvent.setup();
    mockedSettingsApi.resolveDynamicAppearance.mockResolvedValue({
      effective_theme: "dark",
      timezone: "Asia/Kolkata",
      sunrise: "2026-07-07T05:28:00+05:30",
      sunset: "2026-07-07T19:22:00+05:30",
      next_transition_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      source: "open_meteo",
    });

    seedDynamicCoordinates();

    renderConsumer();
    await user.click(screen.getByRole("button", { name: "dynamic" }));

    await waitFor(() => {
      expect(mockedSettingsApi.resolveDynamicAppearance).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    });
  });

  it("falls back to default Indian timings when location permission is unavailable", async () => {
    const user = userEvent.setup();
    const expectedTheme = resolveExpectedIstTheme();

    renderConsumer();
    await user.click(screen.getByRole("button", { name: "dynamic" }));

    await waitFor(() => {
      expect(mockedSettingsApi.resolveDynamicAppearance).not.toHaveBeenCalled();
      expect(screen.getByTestId("theme")).toHaveTextContent(expectedTheme);
    });
  });

  it("retries dynamic lookup when dynamic is selected again", async () => {
    const user = userEvent.setup();
    seedDynamicCoordinates();

    mockedSettingsApi.resolveDynamicAppearance
      .mockRejectedValueOnce(new Error("first lookup failed"))
      .mockResolvedValueOnce({
        effective_theme: "dark",
        timezone: "Asia/Kolkata",
        sunrise: "2026-07-07T05:28:00+05:30",
        sunset: "2026-07-07T19:22:00+05:30",
        next_transition_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        source: "open_meteo",
      });

    renderConsumer();

    await user.click(screen.getByRole("button", { name: "dynamic" }));

    await waitFor(() => {
      expect(mockedSettingsApi.resolveDynamicAppearance).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("theme")).toHaveTextContent("light");
    });

    await user.click(screen.getByRole("button", { name: "dynamic" }));

    await waitFor(() => {
      expect(mockedSettingsApi.resolveDynamicAppearance).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    });
  });

  it("toggles from dynamic resolved dark to light on first click", async () => {
    const user = userEvent.setup();
    seedDynamicCoordinates();

    mockedSettingsApi.resolveDynamicAppearance.mockResolvedValue({
      effective_theme: "dark",
      timezone: "Asia/Kolkata",
      sunrise: "2026-07-07T05:28:00+05:30",
      sunset: "2026-07-07T19:22:00+05:30",
      next_transition_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      source: "open_meteo",
    });

    renderConsumer();

    await user.click(screen.getByRole("button", { name: "dynamic" }));

    await waitFor(() => {
      expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    });

    await user.click(screen.getByRole("button", { name: "toggle" }));

    expect(screen.getByTestId("theme")).toHaveTextContent("light");
  });
});