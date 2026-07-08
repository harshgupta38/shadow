import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { api, tokenStore, type User } from "@/api";
import { ThemeProvider } from "./ThemeContext";
import { ToastProvider } from "./ToastContext";
import { AuthProvider, useAuth } from "./AuthContext";

vi.mock("@/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      auth: {
        me: vi.fn(),
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
      },
    },
  };
});

const mockedAuth = api.auth as unknown as {
  me: Mock;
  login: Mock;
  register: Mock;
  logout: Mock;
};

const fakeUser: User = {
  id: 1,
  email: "ada@example.com",
  name: "Ada Lovelace",
  timezone: "UTC",
  theme_preference: "light",
  onboarding_completed: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

function Consumer() {
  const { status, user, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="user">{user?.name ?? "none"}</span>
      <button onClick={() => void login("ada@example.com", "password1")}>login</button>
      <button onClick={logout}>logout</button>
    </div>
  );
}

function renderConsumer() {
  return render(
    <ToastProvider>
      <ThemeProvider>
        <AuthProvider>
          <Consumer />
        </AuthProvider>
      </ThemeProvider>
    </ToastProvider>,
  );
}

describe("AuthContext", () => {
  beforeEach(() => {
    tokenStore.clear();
    mockedAuth.me.mockReset();
    mockedAuth.login.mockReset();
    mockedAuth.logout.mockReset();
  });

  it("starts unauthenticated when no token is stored", async () => {
    renderConsumer();
    expect(await screen.findByText("unauthenticated")).toBeInTheDocument();
    expect(mockedAuth.me).not.toHaveBeenCalled();
  });

  it("authenticates on login and clears on logout", async () => {
    mockedAuth.login.mockResolvedValue({ access_token: "t", token_type: "bearer" });
    mockedAuth.me.mockResolvedValue(fakeUser);
    const user = userEvent.setup();

    renderConsumer();
    await screen.findByText("unauthenticated");

    await user.click(screen.getByText("login"));

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    expect(screen.getByTestId("user")).toHaveTextContent("Ada Lovelace");

    await user.click(screen.getByText("logout"));
    expect(mockedAuth.logout).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated"));
    expect(screen.getByTestId("user")).toHaveTextContent("none");
  });
});
