import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { api } from "@/api";
import { ToastProvider } from "@/context/ToastContext";

import { GoalFormModal } from "./GoalFormModal";

vi.mock("@/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      goals: {
        ...actual.api.goals,
        create: vi.fn(),
        update: vi.fn(),
        draft: vi.fn(),
      },
    },
  };
});

const mockedGoalsApi = api.goals as unknown as {
  create: Mock;
  update: Mock;
  draft: Mock;
};

function renderModal() {
  return render(
    <ToastProvider>
      <GoalFormModal show onClose={vi.fn()} onSaved={vi.fn()} />
    </ToastProvider>,
  );
}

describe("GoalFormModal", () => {
  beforeEach(() => {
    mockedGoalsApi.create.mockReset();
    mockedGoalsApi.update.mockReset();
    mockedGoalsApi.draft.mockReset();
  });

  it("defaults to Shadow setup mode and locks manual fields until draft is generated", async () => {
    const user = userEvent.setup();
    renderModal();

    expect(screen.getByRole("button", { name: "Let Shadow Setup" })).toHaveClass("active");
    expect(screen.queryByRole("button", { name: "Refine" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Description")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Category")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Target date")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create manually" }));

    expect(screen.getByLabelText("Title")).toBeEnabled();
    expect(screen.getByLabelText("Description")).toBeEnabled();
    expect(screen.getByLabelText("Category")).toBeEnabled();
    expect(screen.getByLabelText("Target date")).toBeEnabled();
  });

  it("generates and populates goal fields from Shadow prompt", async () => {
    const user = userEvent.setup();
    mockedGoalsApi.draft.mockResolvedValue({
      title: "Get SDE role at Google",
      description: "Prepare DSA and interview readiness for Google SDE opportunities.",
      category: "Career",
      target_date: "2026-12-31T00:00:00Z",
    });

    renderModal();

    const promptInput = screen.getByLabelText("Tell Shadow your goal idea");
    expect(screen.queryByRole("button", { name: "Refine" })).not.toBeInTheDocument();

    await user.type(promptInput, "I want to get SDE job at Google");
    const refineButton = screen.getByRole("button", { name: "Refine" });
    expect(refineButton).toHaveClass("text-nowrap");
    await user.click(refineButton);

    await waitFor(() => {
      expect(mockedGoalsApi.draft).toHaveBeenCalledWith({
        prompt: "I want to get SDE job at Google",
      });
    });

    expect(screen.getByLabelText("Title")).toBeEnabled();
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe(
      "Get SDE role at Google",
    );
    expect((screen.getByLabelText("Description") as HTMLTextAreaElement).value).toContain(
      "Prepare DSA",
    );
    expect((screen.getByLabelText("Category") as HTMLInputElement).value).toBe("Career");
    expect((screen.getByLabelText("Target date") as HTMLInputElement).value).toBe("2026-12-31");
  });
});
