import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { api, type EmailNotificationControls } from "@/api";
import { ToastProvider } from "@/context/ToastContext";

import { EmailNotificationControlsPage } from "./EmailNotificationControlsPage";

vi.mock("@/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      settings: {
        ...actual.api.settings,
        getEmailNotificationControls: vi.fn(),
        updateEmailNotificationControls: vi.fn(),
      },
    },
  };
});

const mockedSettingsApi = api.settings as unknown as {
  getEmailNotificationControls: Mock;
  updateEmailNotificationControls: Mock;
};

function buildControls(): EmailNotificationControls {
  return {
    verification_reminders: true,
    password_changed_alert: true,
    new_device_alert: true,
    task_reminders: true,
    today_plan_generated: true,
    daily_motivational_quote: false,
    daily_motivational_quote_time: "07:00",
    daily_brief: true,
    weekly_summary: true,
    streak_risk_alert: true,
    milestone_due_soon: true,
    goal_target_risk: true,
    daily_report_ready: true,
    weekly_report_ready: true,
    progress_coach_recommendations: false,
    export_ready: true,
  };
}

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <EmailNotificationControlsPage />
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe("EmailNotificationControlsPage", () => {
  let currentControls: EmailNotificationControls;

  beforeEach(() => {
    mockedSettingsApi.getEmailNotificationControls.mockReset();
    mockedSettingsApi.updateEmailNotificationControls.mockReset();

    currentControls = buildControls();
    mockedSettingsApi.getEmailNotificationControls.mockResolvedValue(currentControls);
    mockedSettingsApi.updateEmailNotificationControls.mockImplementation(async (data) => {
      currentControls = {
        ...currentControls,
        ...data,
      };
      return currentControls;
    });
  });

  it("renders the grouped email control sections", async () => {
    renderPage();

    expect(await screen.findByText("Always sent")).toBeInTheDocument();
    expect(screen.getByText("Security and account")).toBeInTheDocument();
    expect(screen.getByText("Planning reminders")).toBeInTheDocument();
    expect(screen.getByText("Goals and deadlines")).toBeInTheDocument();
    expect(screen.getByText("Reports and insights")).toBeInTheDocument();
    expect(screen.getByText("Data events")).toBeInTheDocument();
    expect(mockedSettingsApi.getEmailNotificationControls).toHaveBeenCalledTimes(1);

    expect(screen.getByLabelText("Daily motivational quote")).not.toBeChecked();
    expect(screen.queryByLabelText("Inspire me daily at")).not.toBeInTheDocument();
  });

  it("shows daily quote time editor only when motivational quote is enabled", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByLabelText("Daily motivational quote");
    expect(screen.queryByLabelText("Inspire me daily at")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Daily motivational quote"));

    expect(await screen.findByLabelText("Inspire me daily at")).toBeInTheDocument();
  });

  it("enables save when preferences change and persists to backend", async () => {
    const user = userEvent.setup();
    renderPage();

    const saveButton = await screen.findByRole("button", { name: "Saved" });
    expect(saveButton).toBeDisabled();

    await user.click(screen.getByLabelText("Progress Coach recommendations"));

    const savePreferencesButton = await screen.findByRole("button", {
      name: "Save preferences",
    });
    expect(savePreferencesButton).toBeEnabled();

    await user.click(savePreferencesButton);

    await waitFor(() => {
      expect(mockedSettingsApi.updateEmailNotificationControls).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Saved" })).toBeDisabled();
    });

    await screen.findByText("Email controls saved.");

    expect(mockedSettingsApi.updateEmailNotificationControls).toHaveBeenCalledWith(
      expect.objectContaining({
        progress_coach_recommendations: true,
      daily_motivational_quote_time: "07:00",
      }),
    );
  });
});
