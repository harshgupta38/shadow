import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { api } from "@/api";
import { ToastProvider } from "@/context/ToastContext";

import { GoalsPage } from "./GoalsPage";

vi.mock("@/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      goals: {
        ...actual.api.goals,
        list: vi.fn(),
      },
    },
  };
});

const mockedGoalsApi = api.goals as unknown as {
  list: Mock;
};

describe("GoalsPage", () => {
  beforeEach(() => {
    mockedGoalsApi.list.mockReset();
  });

  it("sorts goals by due date and pushes missing dates to the bottom", async () => {
    mockedGoalsApi.list.mockResolvedValue([
      {
        id: 1,
        title: "No Date Goal",
        description: null,
        category: "Personal",
        status: "active",
        progress: 0,
        target_date: null,
        created_at: "2026-07-01T10:00:00Z",
        updated_at: "2026-07-01T10:00:00Z",
        milestones: [],
      },
      {
        id: 2,
        title: "Later Goal",
        description: null,
        category: "Career",
        status: "active",
        progress: 0,
        target_date: "2026-10-15T00:00:00Z",
        created_at: "2026-07-01T10:00:00Z",
        updated_at: "2026-07-01T10:00:00Z",
        milestones: [],
      },
      {
        id: 3,
        title: "Soon Goal",
        description: null,
        category: "Career",
        status: "active",
        progress: 0,
        target_date: "2026-07-20T00:00:00Z",
        created_at: "2026-07-01T10:00:00Z",
        updated_at: "2026-07-01T10:00:00Z",
        milestones: [],
      },
    ]);

    render(
      <MemoryRouter>
        <ToastProvider>
          <GoalsPage />
        </ToastProvider>
      </MemoryRouter>,
    );

    const goalHeadings = await screen.findAllByRole("heading", { level: 3 });
    const titles = goalHeadings.map((heading) => heading.textContent?.trim());

    expect(titles).toEqual(["Soon Goal", "Later Goal", "No Date Goal"]);
  });
});
