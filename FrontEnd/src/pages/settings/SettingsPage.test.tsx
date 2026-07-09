import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { api, type SettingsRead } from "@/api";
import { ToastProvider } from "@/context/ToastContext";

import { SettingsPage } from "./SettingsPage";

const { patchUserMock, setThemeMock, themeRuntimeState, authRuntimeState } = vi.hoisted(() => ({
  patchUserMock: vi.fn(),
  setThemeMock: vi.fn(),
  authRuntimeState: {
    user: {
      id: 1,
      email: "user@example.com",
      name: "Test User",
      timezone: "Asia/Kolkata",
      theme_preference: "light",
      subscription_plan: "free",
      email_verified: true,
      auth_provider: "password",
      last_password_changed_at: "2026-07-01T00:00:00.000Z",
      onboarding_completed: true,
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-01T00:00:00.000Z",
    },
  },
  themeRuntimeState: {
    theme: "light" as "light" | "dark",
    dynamicThemeInfo: {
      mode: "idle",
      source: null,
      sunrise: null,
      sunset: null,
      nextTransitionAt: null,
      timezone: null,
    } as {
      mode: "idle" | "resolving" | "success" | "location-unavailable" | "api-failed";
      source: "open_meteo" | "sunrise_sunset" | "default_ist" | null;
      sunrise: string | null;
      sunset: string | null;
      nextTransitionAt: string | null;
      timezone: string | null;
    },
  },
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: authRuntimeState.user,
    patchUser: patchUserMock,
  }),
}));

vi.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({
    theme: themeRuntimeState.theme,
    themePreference: "light",
    setTheme: setThemeMock,
    toggleTheme: vi.fn(),
    dynamicThemeInfo: themeRuntimeState.dynamicThemeInfo,
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
      notifications: {
        ...actual.api.notifications,
        getPushPublicKey: vi.fn(),
        notifyDeviceConnected: vi.fn(),
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
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
  updateAccessibility: Mock;
};

const mockedProfileApi = api.profile as unknown as {
  exportAccountData: Mock;
  clearChatHistory: Mock;
};

const mockedNotificationsApi = api.notifications as unknown as {
  getPushPublicKey: Mock;
  notifyDeviceConnected: Mock;
  subscribe: Mock;
  unsubscribe: Mock;
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
    authRuntimeState.user = {
      id: 1,
      email: "user@example.com",
      name: "Test User",
      timezone: "Asia/Kolkata",
      theme_preference: "light",
      subscription_plan: "free",
      email_verified: true,
      auth_provider: "password",
      last_password_changed_at: "2026-07-01T00:00:00.000Z",
      onboarding_completed: true,
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-01T00:00:00.000Z",
    };

    patchUserMock.mockReset();
    setThemeMock.mockReset();
    themeRuntimeState.theme = "light";
    themeRuntimeState.dynamicThemeInfo = {
      mode: "idle",
      source: null,
      sunrise: null,
      sunset: null,
      nextTransitionAt: null,
      timezone: null,
    };

    mockedSettingsApi.get.mockReset();
    mockedSettingsApi.updateAppearance.mockReset();
    mockedSettingsApi.updateNotifications.mockReset();
    mockedSettingsApi.updateAIBehavior.mockReset();
    mockedSettingsApi.updatePlanner.mockReset();
    mockedSettingsApi.updatePrivacy.mockReset();
    mockedSettingsApi.updateAccessibility.mockReset();

    mockedNotificationsApi.getPushPublicKey.mockReset();
    mockedNotificationsApi.notifyDeviceConnected.mockReset();
    mockedNotificationsApi.subscribe.mockReset();
    mockedNotificationsApi.unsubscribe.mockReset();

    mockedProfileApi.exportAccountData.mockReset();
    mockedProfileApi.clearChatHistory.mockReset();

    currentSettings = buildSettings();
    mockedSettingsApi.get.mockResolvedValue(currentSettings);
    mockedNotificationsApi.getPushPublicKey.mockResolvedValue({
      configured: true,
      public_key: "BEl6Q5Yj98jxyQv6Tf2XnAcf3Q8r8A6fFK5_XhKfAovZJx5_W6kQ5u0Jg2yB9h3mG0qR3D2QX2s-9oM2I4mRwLQ",
    });
    mockedNotificationsApi.notifyDeviceConnected.mockResolvedValue(undefined);
    mockedNotificationsApi.subscribe.mockResolvedValue(undefined);
    mockedNotificationsApi.unsubscribe.mockResolvedValue(undefined);

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

  it("persists dynamic theme preference", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Dynamic" }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockedSettingsApi.updateAppearance).toHaveBeenCalledTimes(1);
    });

    expect(mockedSettingsApi.updateAppearance).toHaveBeenCalledWith({
      theme_preference: "dynamic",
    });
    expect(patchUserMock).toHaveBeenCalledWith({ theme_preference: "dynamic" });
    expect(setThemeMock).toHaveBeenCalledWith("dynamic");
  });

  it("shows dynamic info message only when dynamic theme is selected", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.queryByTestId("dynamic-theme-message")).not.toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "Dynamic" }));

    expect(await screen.findByTestId("dynamic-theme-message")).toBeInTheDocument();
  });

  it("shows fallback message when location access is not available", async () => {
    const user = userEvent.setup();
    themeRuntimeState.dynamicThemeInfo = {
      mode: "location-unavailable",
      source: null,
      sunrise: null,
      sunset: null,
      nextTransitionAt: null,
      timezone: null,
    };

    renderPage();
    await user.click(await screen.findByRole("button", { name: "Dynamic" }));

    expect(await screen.findByText(/location access is not available/i)).toBeInTheDocument();
    expect(screen.getByText(/standard indian sunrise and sunset timings/i)).toBeInTheDocument();
  });

  it("shows fallback message when dynamic API lookup fails", async () => {
    const user = userEvent.setup();
    themeRuntimeState.dynamicThemeInfo = {
      mode: "api-failed",
      source: null,
      sunrise: null,
      sunset: null,
      nextTransitionAt: null,
      timezone: null,
    };

    renderPage();
    await user.click(await screen.findByRole("button", { name: "Dynamic" }));

    expect(await screen.findByText(/unable to fetch sunrise\/sunset data/i)).toBeInTheDocument();
    expect(screen.getByText(/standard indian sunrise and sunset timings/i)).toBeInTheDocument();
  });

  it("shows light-mode transition message when dynamic resolve succeeds", async () => {
    const user = userEvent.setup();
    themeRuntimeState.theme = "light";
    themeRuntimeState.dynamicThemeInfo = {
      mode: "success",
      source: "open_meteo",
      sunrise: "2026-07-08T05:29:00+05:30",
      sunset: "2026-07-08T19:22:00+05:30",
      nextTransitionAt: "2026-07-08T19:22:00+05:30",
      timezone: "Asia/Kolkata",
    };

    renderPage();
    await user.click(await screen.findByRole("button", { name: "Dynamic" }));

    const message = await screen.findByText(/^Light theme till sunset at/i);
    expect(message).toBeInTheDocument();
    expect(message.textContent).toMatch(/\bAM\b|\bPM\b/);
    expect(message.textContent).toMatch(/\bIST\b/);
  });

  it("shows dark-mode transition message when dynamic resolve succeeds", async () => {
    const user = userEvent.setup();
    themeRuntimeState.theme = "dark";
    themeRuntimeState.dynamicThemeInfo = {
      mode: "success",
      source: "open_meteo",
      sunrise: "2026-07-09T05:29:00+05:30",
      sunset: "2026-07-08T19:22:00+05:30",
      nextTransitionAt: "2026-07-09T05:29:00+05:30",
      timezone: "Asia/Kolkata",
    };

    renderPage();
    await user.click(await screen.findByRole("button", { name: "Dynamic" }));

    const message = await screen.findByText(/^Dark theme till sunrise at/i);
    expect(message).toBeInTheDocument();
    expect(message.textContent).toMatch(/\bAM\b|\bPM\b/);
    expect(message.textContent).toMatch(/\bIST\b/);
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

  it("connects this device for push and saves notification preference", async () => {
    const user = userEvent.setup();
    currentSettings = buildSettings();
    currentSettings.notifications.push_notifications_enabled = false;
    mockedSettingsApi.get.mockResolvedValue(currentSettings);

    const subscription = {
      endpoint: "https://example.push/sub-1",
      toJSON: () => ({
        endpoint: "https://example.push/sub-1",
        keys: {
          p256dh: "test-p256dh",
          auth: "test-auth",
        },
      }),
      unsubscribe: vi.fn().mockResolvedValue(true),
    } as unknown as PushSubscription;

    const pushManager = {
      getSubscription: vi.fn().mockResolvedValue(null),
      subscribe: vi.fn().mockResolvedValue(subscription),
    };

    const originalServiceWorkerDescriptor = Object.getOwnPropertyDescriptor(
      navigator,
      "serviceWorker",
    );

    vi.stubGlobal("Notification", {
      permission: "granted",
      requestPermission: vi.fn().mockResolvedValue("granted"),
    });
    vi.stubGlobal("PushManager", function PushManager() {});
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        ready: Promise.resolve({ pushManager }),
      },
    });

    try {
      renderPage();

      await user.click(await screen.findByLabelText("Push notifications"));
      await user.click(await screen.findByRole("button", { name: /connect this device/i }));
      await user.click(screen.getByRole("button", { name: /save changes/i }));

      await waitFor(() => {
        expect(mockedNotificationsApi.getPushPublicKey).toHaveBeenCalled();
        expect(mockedNotificationsApi.subscribe).toHaveBeenCalledWith({
          endpoint: "https://example.push/sub-1",
          keys: {
            p256dh: "test-p256dh",
            auth: "test-auth",
          },
        });
        expect(mockedNotificationsApi.notifyDeviceConnected).toHaveBeenCalledWith({
          connected_endpoint: "https://example.push/sub-1",
        });
        expect(mockedSettingsApi.updateNotifications).toHaveBeenCalledWith(
          expect.objectContaining({ push_notifications_enabled: true }),
        );
      });
    } finally {
      if (originalServiceWorkerDescriptor) {
        Object.defineProperty(navigator, "serviceWorker", originalServiceWorkerDescriptor);
      } else {
        Reflect.deleteProperty(navigator, "serviceWorker");
      }
      vi.unstubAllGlobals();
    }
  });

  it("auto-syncs an existing device subscription on initial settings load", async () => {
    const subscription = {
      endpoint: "https://web.push.apple.com/sub-existing",
      toJSON: () => ({
        endpoint: "https://web.push.apple.com/sub-existing",
        keys: {
          p256dh: "existing-p256dh",
          auth: "existing-auth",
        },
      }),
      unsubscribe: vi.fn().mockResolvedValue(true),
    } as unknown as PushSubscription;

    const pushManager = {
      getSubscription: vi.fn().mockResolvedValue(subscription),
      subscribe: vi.fn(),
    };

    const originalServiceWorkerDescriptor = Object.getOwnPropertyDescriptor(
      navigator,
      "serviceWorker",
    );

    vi.stubGlobal("Notification", {
      permission: "granted",
      requestPermission: vi.fn().mockResolvedValue("granted"),
    });
    vi.stubGlobal("PushManager", function PushManager() {});
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        ready: Promise.resolve({ pushManager }),
      },
    });

    try {
      renderPage();

      await waitFor(() => {
        expect(mockedNotificationsApi.subscribe).toHaveBeenCalledWith({
          endpoint: "https://web.push.apple.com/sub-existing",
          keys: {
            p256dh: "existing-p256dh",
            auth: "existing-auth",
          },
        });
      });

      expect(await screen.findByText("Connected")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /disconnect device/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /connect this device/i })).not.toBeInTheDocument();
      expect(pushManager.subscribe).not.toHaveBeenCalled();
    } finally {
      if (originalServiceWorkerDescriptor) {
        Object.defineProperty(navigator, "serviceWorker", originalServiceWorkerDescriptor);
      } else {
        Reflect.deleteProperty(navigator, "serviceWorker");
      }
      vi.unstubAllGlobals();
    }
  });

  it("auto-syncs when subscription keys come from getKey fallback", async () => {
    const subscription = {
      endpoint: "https://web.push.apple.com/sub-getkey",
      toJSON: () => ({
        endpoint: "https://web.push.apple.com/sub-getkey",
      }),
      getKey: vi.fn((name: string) => {
        if (name === "p256dh") return Uint8Array.from([1, 2, 3]).buffer;
        if (name === "auth") return Uint8Array.from([4, 5, 6]).buffer;
        return null;
      }),
      unsubscribe: vi.fn().mockResolvedValue(true),
    } as unknown as PushSubscription;

    const pushManager = {
      getSubscription: vi.fn().mockResolvedValue(subscription),
      subscribe: vi.fn(),
    };

    const originalServiceWorkerDescriptor = Object.getOwnPropertyDescriptor(
      navigator,
      "serviceWorker",
    );

    vi.stubGlobal("Notification", {
      permission: "granted",
      requestPermission: vi.fn().mockResolvedValue("granted"),
    });
    vi.stubGlobal("PushManager", function PushManager() {});
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        ready: Promise.resolve({ pushManager }),
      },
    });

    try {
      renderPage();

      await waitFor(() => {
        expect(mockedNotificationsApi.subscribe).toHaveBeenCalledWith({
          endpoint: "https://web.push.apple.com/sub-getkey",
          keys: {
            p256dh: "AQID",
            auth: "BAUG",
          },
        });
      });
      expect(await screen.findByText("Connected")).toBeInTheDocument();
    } finally {
      if (originalServiceWorkerDescriptor) {
        Object.defineProperty(navigator, "serviceWorker", originalServiceWorkerDescriptor);
      } else {
        Reflect.deleteProperty(navigator, "serviceWorker");
      }
      vi.unstubAllGlobals();
    }
  });

  it("falls back to not connected when existing subscription sync fails on load", async () => {
    mockedNotificationsApi.subscribe.mockRejectedValueOnce(new Error("sync failed"));

    const subscription = {
      endpoint: "https://web.push.apple.com/sub-existing",
      toJSON: () => ({
        endpoint: "https://web.push.apple.com/sub-existing",
        keys: {
          p256dh: "existing-p256dh",
          auth: "existing-auth",
        },
      }),
      unsubscribe: vi.fn().mockResolvedValue(true),
    } as unknown as PushSubscription;

    const pushManager = {
      getSubscription: vi.fn().mockResolvedValue(subscription),
      subscribe: vi.fn(),
    };

    const originalServiceWorkerDescriptor = Object.getOwnPropertyDescriptor(
      navigator,
      "serviceWorker",
    );

    vi.stubGlobal("Notification", {
      permission: "granted",
      requestPermission: vi.fn().mockResolvedValue("granted"),
    });
    vi.stubGlobal("PushManager", function PushManager() {});
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        ready: Promise.resolve({ pushManager }),
      },
    });

    try {
      renderPage();

      expect(await screen.findByRole("button", { name: /connect this device/i })).toBeInTheDocument();
      expect(screen.getByText("sync failed")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /disconnect device/i })).not.toBeInTheDocument();
    } finally {
      if (originalServiceWorkerDescriptor) {
        Object.defineProperty(navigator, "serviceWorker", originalServiceWorkerDescriptor);
      } else {
        Reflect.deleteProperty(navigator, "serviceWorker");
      }
      vi.unstubAllGlobals();
    }
  });

  it("keeps global save disabled when nothing changed", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Saved" })).toBeDisabled();
    });
  });

  it("shows email control CTA only after enabling email notifications", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.queryByRole("link", { name: "Control what you see" })).not.toBeInTheDocument();

    await user.click(await screen.findByLabelText("Email notifications"));

    const cta = await screen.findByRole("link", { name: "Control what you see" });
    expect(cta).toHaveAttribute("href", "/settings/email-controls");
  });

  it("blocks enabling email notifications when email is not verified", async () => {
    authRuntimeState.user = {
      ...authRuntimeState.user,
      email_verified: false,
    };
    currentSettings.notifications.email_notifications_enabled = true;
    const user = userEvent.setup();
    renderPage();

    expect(
      await screen.findByText("Verify your email to enable email notifications."),
    ).toBeInTheDocument();

    const emailToggle = await screen.findByLabelText("Email notifications");
    expect(emailToggle).toBeDisabled();
    expect(emailToggle).not.toBeChecked();
    expect(screen.queryByRole("link", { name: "Control what you see" })).not.toBeInTheDocument();
  });

  it("does not call export API when email is not verified", async () => {
    authRuntimeState.user = {
      ...authRuntimeState.user,
      email_verified: false,
    };
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Export my data" }));
    expect(mockedProfileApi.exportAccountData).not.toHaveBeenCalled();
  });

  it("shows an automation entry linking to the dedicated automation page", async () => {
    renderPage();

    const link = await screen.findByRole("link", { name: "Show automations" });
    expect(link).toHaveAttribute("href", "/automation");
  });
});
