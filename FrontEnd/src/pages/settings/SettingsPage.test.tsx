import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { api, type SettingsRead } from "@/api";
import { ToastProvider } from "@/context/ToastContext";

import { SettingsPage } from "./SettingsPage";

const { patchUserMock, setThemeMock } = vi.hoisted(() => ({
  patchUserMock: vi.fn(),
  setThemeMock: vi.fn(),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    patchUser: patchUserMock,
  }),
}));

vi.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({
    setTheme: setThemeMock,
  }),
}));

vi.mock("@/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      settings: {
        ...actual.api.settings,
        get: vi.fn(),
        updateAppearance: vi.fn(),
        updateNotifications: vi.fn(),
        updateAIBehavior: vi.fn(),
        updatePlanner: vi.fn(),
        updatePrivacy: vi.fn(),
        updateIntegrations: vi.fn(),
        updateAccessibility: vi.fn(),
      },
      profile: {
        ...actual.api.profile,
        exportAccountData: vi.fn(),
        clearChatHistory: vi.fn(),
      },
    },
  };
});

const mockedSettingsApi = api.settings as unknown as {
  get: Mock;
  updateAppearance: Mock;
  updateNotifications: Mock;
  updateAIBehavior: Mock;
  updatePlanner: Mock;
  updatePrivacy: Mock;
  updateIntegrations: Mock;
  updateAccessibility: Mock;
};

const mockedProfileApi = api.profile as unknown as {
  exportAccountData: Mock;
  clearChatHistory: Mock;
};

function buildSettings(): SettingsRead {
  return {
    appearance: {
      theme_preference: "light",
    },
    notifications: {
      notifications_enabled: true,
      push_notifications_enabled: true,
      email_notifications_enabled: false,
      reminder_notifications_enabled: true,
      daily_brief_enabled: true,
      daily_brief_time: "08:00",
      weekly_summary_enabled: true,
    },
    ai_behavior: {
      ai_response_length: "balanced",
      ai_personality: "coach",
      ai_default_model: "gemini-2.5-flash",
      ai_suggestions_enabled: true,
      smart_planning_enabled: true,
    },
    planner: {
      week_starts_on: "monday",
      default_reminder_time: "08:00",
      default_task_duration_minutes: 45,
      time_format: "12h",
      date_format: "dd/mm/yyyy",
    },
    privacy: {
      analytics_opt_out: false,
      ai_memory_enabled: true,
    },
    integrations: {
      google_calendar_enabled: false,
      slack_enabled: false,
    },
    accessibility: {
      reduced_motion: false,
      high_contrast: false,
      font_scale_percent: 100,
    },
  };
}

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe("SettingsPage", () => {
  let currentSettings: SettingsRead;

  beforeEach(() => {
    patchUserMock.mockReset();
    setThemeMock.mockReset();

    mockedSettingsApi.get.mockReset();
    mockedSettingsApi.updateAppearance.mockReset();
    mockedSettingsApi.updateNotifications.mockReset();
    mockedSettingsApi.updateAIBehavior.mockReset();
    mockedSettingsApi.updatePlanner.mockReset();
    mockedSettingsApi.updatePrivacy.mockReset();
    mockedSettingsApi.updateIntegrations.mockReset();
    mockedSettingsApi.updateAccessibility.mockReset();

    mockedProfileApi.exportAccountData.mockReset();
    mockedProfileApi.clearChatHistory.mockReset();

    currentSettings = buildSettings();
    mockedSettingsApi.get.mockResolvedValue(currentSettings);

    mockedSettingsApi.updateAppearance.mockImplementation(async (data) => {
      currentSettings = {
        ...currentSettings,
        appearance: {
          ...currentSettings.appearance,
          ...data,
        },
      };
      return currentSettings;
    });

    mockedSettingsApi.updateNotifications.mockImplementation(async (data) => {
      currentSettings = {
        ...currentSettings,
        notifications: {
          ...currentSettings.notifications,
          ...data,
        },
      };
      return currentSettings;
    });

    mockedSettingsApi.updateAIBehavior.mockImplementation(async (data) => {
      currentSettings = {
        ...currentSettings,
        ai_behavior: {
          ...currentSettings.ai_behavior,
          ...data,
        },
      };
      return currentSettings;
    });

    mockedSettingsApi.updatePlanner.mockImplementation(async (data) => {
      currentSettings = {
        ...currentSettings,
        planner: {
          ...currentSettings.planner,
          ...data,
        },
      };
      return currentSettings;
    });

    mockedSettingsApi.updatePrivacy.mockImplementation(async (data) => {
      currentSettings = {
        ...currentSettings,
        privacy: {
          ...currentSettings.privacy,
          ...data,
        },
      };
      return currentSettings;
    });

    mockedSettingsApi.updateIntegrations.mockImplementation(async (data) => {
      currentSettings = {
        ...currentSettings,
        integrations: {
          ...currentSettings.integrations,
          ...data,
        },
      };
      return currentSettings;
    });

    mockedSettingsApi.updateAccessibility.mockImplementation(async (data) => {
      currentSettings = {
        ...currentSettings,
        accessibility: {
          ...currentSettings.accessibility,
          ...data,
        },
      };
      return currentSettings;
    });

    mockedProfileApi.exportAccountData.mockResolvedValue({
      exported_at: "2026-07-07T00:00:00.000Z",
      data: {},
    });

    mockedProfileApi.clearChatHistory.mockResolvedValue({
      deleted_sessions: 0,
      deleted_messages: 0,
    });
  });

  it("shows a single global save button and no section save buttons", async () => {
    renderPage();

    expect(await screen.findByRole("button", { name: "Saved" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Browser Default" })).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: /save appearance/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save notifications/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save privacy/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save integrations/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save accessibility/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save ai behavior/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save planner defaults/i })).not.toBeInTheDocument();
  });

  it("saves only the changed section when one section is edited", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByLabelText("Enable notifications"));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockedSettingsApi.updateNotifications).toHaveBeenCalledTimes(1);
    });

    expect(mockedSettingsApi.updateAppearance).not.toHaveBeenCalled();
    expect(mockedSettingsApi.updateAIBehavior).not.toHaveBeenCalled();
    expect(mockedSettingsApi.updatePlanner).not.toHaveBeenCalled();
    expect(mockedSettingsApi.updatePrivacy).not.toHaveBeenCalled();
    expect(mockedSettingsApi.updateIntegrations).not.toHaveBeenCalled();
    expect(mockedSettingsApi.updateAccessibility).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Saved" })).toBeDisabled();
    });
  });

  it("saves only changed sections when multiple sections are edited", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Dark" }));
    await user.selectOptions(screen.getByLabelText("Personality"), "mentor");

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockedSettingsApi.updateAppearance).toHaveBeenCalledTimes(1);
      expect(mockedSettingsApi.updateAIBehavior).toHaveBeenCalledTimes(1);
    });

    expect(mockedSettingsApi.updateNotifications).not.toHaveBeenCalled();
    expect(mockedSettingsApi.updatePlanner).not.toHaveBeenCalled();
    expect(mockedSettingsApi.updatePrivacy).not.toHaveBeenCalled();
    expect(mockedSettingsApi.updateIntegrations).not.toHaveBeenCalled();
    expect(mockedSettingsApi.updateAccessibility).not.toHaveBeenCalled();

    expect(patchUserMock).toHaveBeenCalledWith({ theme_preference: "dark" });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Saved" })).toBeDisabled();
    });
  });

  it("persists browser default theme as browser preference", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Browser Default" }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockedSettingsApi.updateAppearance).toHaveBeenCalledTimes(1);
    });

    expect(mockedSettingsApi.updateAppearance).toHaveBeenCalledWith({
      theme_preference: "browser",
    });
    expect(patchUserMock).toHaveBeenCalledWith({ theme_preference: "browser" });
    expect(setThemeMock).toHaveBeenCalledWith("browser");
  });

  it("continues saving remaining changed sections when one section fails", async () => {
    const user = userEvent.setup();
    mockedSettingsApi.updateNotifications.mockRejectedValueOnce(new Error("Network failure"));

    renderPage();

    await user.click(await screen.findByLabelText("Enable notifications"));

    const plannerDurationInput = screen.getByLabelText("Default task duration (minutes)");
    await user.clear(plannerDurationInput);
    await user.type(plannerDurationInput, "60");

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockedSettingsApi.updateNotifications).toHaveBeenCalledTimes(1);
      expect(mockedSettingsApi.updatePlanner).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save changes/i })).toBeEnabled();
    });
  });

  it("keeps global save disabled when nothing changed", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Saved" })).toBeDisabled();
    });
  });
});
