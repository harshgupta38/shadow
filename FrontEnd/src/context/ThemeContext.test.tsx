import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/api";

import { ThemeProvider, useTheme } from "./ThemeContext";

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
    <ThemeProvider>
      <ThemeConsumer />
    </ThemeProvider>,
  );
}

describe("ThemeContext dynamic mode", () => {
  beforeEach(() => {
    mockedSettingsApi.resolveDynamicAppearance.mockReset();
    window.localStorage.clear();
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

    const geolocationMock = {
      getCurrentPosition: vi.fn((resolve: (position: GeolocationPosition) => void) =>
        resolve({
          coords: {
            latitude: 28.6139,
            longitude: 77.209,
            accuracy: 10,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
            toJSON: () => ({}),
          },
          timestamp: Date.now(),
          toJSON: () => ({}),
        } as GeolocationPosition),
      ),
    };

    vi.stubGlobal("navigator", {
      ...navigator,
      geolocation: geolocationMock,
    });

    renderConsumer();
    await user.click(screen.getByRole("button", { name: "dynamic" }));

    await waitFor(() => {
      expect(mockedSettingsApi.resolveDynamicAppearance).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    });
  });

  it("falls back to browser/system theme when dynamic lookup fails", async () => {
    const user = userEvent.setup();
    mockedSettingsApi.resolveDynamicAppearance.mockRejectedValue(new Error("downstream unavailable"));

    const geolocationMock = {
      getCurrentPosition: vi.fn((resolve: (position: GeolocationPosition) => void) =>
        resolve({
          coords: {
            latitude: 28.6139,
            longitude: 77.209,
            accuracy: 10,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
            toJSON: () => ({}),
          },
          timestamp: Date.now(),
          toJSON: () => ({}),
        } as GeolocationPosition),
      ),
    };

    vi.stubGlobal("navigator", {
      ...navigator,
      geolocation: geolocationMock,
    });

    renderConsumer();
    await user.click(screen.getByRole("button", { name: "dynamic" }));

    await waitFor(() => {
      expect(mockedSettingsApi.resolveDynamicAppearance).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("theme")).toHaveTextContent("light");
    });
  });

  it("switches to light on first toggle click when dynamic resolves to dark", async () => {
    const user = userEvent.setup();
    mockedSettingsApi.resolveDynamicAppearance.mockResolvedValue({
      effective_theme: "dark",
      timezone: "Asia/Kolkata",
      sunrise: "2026-07-07T05:28:00+05:30",
      sunset: "2026-07-07T19:22:00+05:30",
      next_transition_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      source: "open_meteo",
    });

    const geolocationMock = {
      getCurrentPosition: vi.fn((resolve: (position: GeolocationPosition) => void) =>
        resolve({
          coords: {
            latitude: 28.6139,
            longitude: 77.209,
            accuracy: 10,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
            toJSON: () => ({}),
          },
          timestamp: Date.now(),
          toJSON: () => ({}),
        } as GeolocationPosition),
      ),
    };

    vi.stubGlobal("navigator", {
      ...navigator,
      geolocation: geolocationMock,
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