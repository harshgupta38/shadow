import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import { ToastProvider } from "@/context/ToastContext";

import { EmailNotificationControlsPage } from "./EmailNotificationControlsPage";

const STORAGE_KEY = "shadow.emailNotificationControls.v1";

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
  beforeEach(() => {
    window.localStorage.removeItem(STORAGE_KEY);
  });

  it("renders the grouped email control sections", () => {
    renderPage();

    expect(screen.getByText("Always sent")).toBeInTheDocument();
    expect(screen.getByText("Security and account")).toBeInTheDocument();
    expect(screen.getByText("Planning reminders")).toBeInTheDocument();
    expect(screen.getByText("Goals and deadlines")).toBeInTheDocument();
    expect(screen.getByText("Reports and insights")).toBeInTheDocument();
    expect(screen.getByText("Data events")).toBeInTheDocument();

    expect(screen.getByLabelText("Daily motivational quote")).not.toBeChecked();
    expect(screen.queryByLabelText("Inspire me daily at")).not.toBeInTheDocument();
  });

  it("shows daily quote time editor only when motivational quote is enabled", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.queryByLabelText("Inspire me daily at")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Daily motivational quote"));

    expect(await screen.findByLabelText("Inspire me daily at")).toBeInTheDocument();
  });

  it("enables save when preferences change and persists locally", async () => {
    const user = userEvent.setup();
    renderPage();

    const saveButton = screen.getByRole("button", { name: "Saved" });
    expect(saveButton).toBeDisabled();

    await user.click(screen.getByLabelText("Progress Coach recommendations"));

    const savePreferencesButton = await screen.findByRole("button", {
      name: "Save preferences",
    });
    expect(savePreferencesButton).toBeEnabled();

    await user.click(savePreferencesButton);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Saved" })).toBeDisabled();
    });

    await screen.findByText("Email controls saved locally.");

    const persisted = window.localStorage.getItem(STORAGE_KEY);
    expect(persisted).toBeTruthy();
    expect(JSON.parse(persisted || "{}")).toMatchObject({
      preferences: {
        progress_coach_recommendations: true,
      },
      daily_motivational_quote_time: "07:00",
    });
  });
});
