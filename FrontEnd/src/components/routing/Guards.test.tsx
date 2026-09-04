import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RequireVerifiedEmail } from "./Guards";

const { authRuntimeState } = vi.hoisted(() => ({
  authRuntimeState: {
    status: "authenticated" as "loading" | "authenticated" | "unauthenticated",
    isAuthenticated: true,
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
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => authRuntimeState,
}));

describe("RequireVerifiedEmail", () => {
  beforeEach(() => {
    authRuntimeState.status = "authenticated";
    authRuntimeState.isAuthenticated = true;
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
  });

  it("redirects unverified users to settings", async () => {
    authRuntimeState.user = {
      ...authRuntimeState.user,
      email_verified: false,
    };

    render(
      <MemoryRouter initialEntries={["/settings/email-controls"]}>
        <Routes>
          <Route
            path="/settings/email-controls"
            element={
              <RequireVerifiedEmail>
                <div>Email controls page</div>
              </RequireVerifiedEmail>
            }
          />
          <Route path="/settings" element={<div>Settings page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Settings page")).toBeInTheDocument();
    expect(screen.queryByText("Email controls page")).not.toBeInTheDocument();
  });

  it("allows verified users to continue", async () => {
    render(
      <MemoryRouter initialEntries={["/settings/email-controls"]}>
        <Routes>
          <Route
            path="/settings/email-controls"
            element={
              <RequireVerifiedEmail>
                <div>Email controls page</div>
              </RequireVerifiedEmail>
            }
          />
          <Route path="/settings" element={<div>Settings page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Email controls page")).toBeInTheDocument();
    expect(screen.queryByText("Settings page")).not.toBeInTheDocument();
  });
});
