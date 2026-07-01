import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api";
import { ThemeProvider } from "@/context/ThemeContext";
import { LoginPage } from "./LoginPage";

const loginMock = vi.fn();

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ login: loginMock }),
}));

function renderPage() {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={["/login"]}>
        <LoginPage />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    loginMock.mockReset();
  });

  it("submits the entered credentials", async () => {
    loginMock.mockResolvedValue({ id: 1 });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "password1");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(loginMock).toHaveBeenCalledWith("ada@example.com", "password1");
  });

  it("shows an error message when login fails", async () => {
    loginMock.mockRejectedValue(new ApiError({ message: "Invalid email or password" }));
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "wrongpass");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText("Invalid email or password")).toBeInTheDocument();
  });
});
