import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { ApiError, api } from "@/api";
import { ToastProvider } from "@/context/ToastContext";

import { ChatPage } from "./ChatPage";

vi.mock("@/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      chat: {
        sessions: vi.fn(),
        createSession: vi.fn(),
        messages: vi.fn(),
        send: vi.fn(),
        deleteSession: vi.fn(),
        executeAction: vi.fn(),
      },
    },
  };
});

const mockedChat = api.chat as unknown as {
  sessions: Mock;
  createSession: Mock;
  messages: Mock;
  send: Mock;
  deleteSession: Mock;
  executeAction: Mock;
};

const sessionFixture = {
  id: 1,
  agent_type: "general",
  title: "Focus Sprint",
  goal_id: null,
  created_at: "2026-07-03T10:00:00Z",
  updated_at: "2026-07-03T10:00:00Z",
} as const;

function renderPage(path = "/assistant") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <ChatPage />
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe("ChatPage", () => {
  beforeEach(() => {
    mockedChat.sessions.mockReset();
    mockedChat.createSession.mockReset();
    mockedChat.messages.mockReset();
    mockedChat.send.mockReset();
    mockedChat.deleteSession.mockReset();
    mockedChat.executeAction.mockReset();

    mockedChat.sessions.mockResolvedValue([sessionFixture]);
    mockedChat.createSession.mockResolvedValue(sessionFixture);
    mockedChat.messages.mockResolvedValue([]);
    mockedChat.deleteSession.mockResolvedValue(undefined);
    mockedChat.executeAction.mockResolvedValue({
      status: "executed",
      message: "Action completed",
      action: null,
      link: "/plan",
      entity_id: 1,
    });

    HTMLElement.prototype.scrollTo = vi.fn();
  });

  it("deletes the selected conversation after confirmation", async () => {
    const user = userEvent.setup();
    renderPage();

    const title = await screen.findByText("Focus Sprint");
    await user.click(title.closest("button") as HTMLButtonElement);

    await user.click(screen.getByLabelText("Delete conversation"));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(mockedChat.deleteSession).toHaveBeenCalledWith(1));
    expect(await screen.findByText("Conversation deleted.")).toBeInTheDocument();
    expect(screen.queryByText("Focus Sprint")).not.toBeInTheDocument();
  });

  it("rolls back deletion in the list when API delete fails", async () => {
    mockedChat.deleteSession.mockRejectedValue(new ApiError({ message: "Delete failed" }));
    const user = userEvent.setup();
    renderPage();

    const title = await screen.findByText("Focus Sprint");
    await user.click(title.closest("button") as HTMLButtonElement);

    await user.click(screen.getByLabelText("Delete conversation"));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Delete failed")).toBeInTheDocument();
    await waitFor(() => expect(mockedChat.sessions).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Focus Sprint")).toBeInTheDocument();
  });

  it("auto-runs high-confidence assistant proposals", async () => {
    const proposal = {
      id: "act-1",
      module: "plan",
      type: "plan.create_task",
      title: "Create focus block",
      rationale: "User asked to add a task.",
      confidence: "high",
      requires_confirmation: false,
      destructive: false,
      args: { title: "Focus block" },
    } as const;
    mockedChat.send.mockResolvedValue({
      user_message: {
        id: 101,
        session_id: 1,
        role: "user",
        content: "Add a focus block",
        agent_type: "general",
        created_at: "2026-07-03T10:05:00Z",
      },
      assistant_message: {
        id: 102,
        session_id: 1,
        role: "assistant",
        content: "Sure, I can do that.",
        agent_type: "general",
        created_at: "2026-07-03T10:05:02Z",
      },
      session: {
        ...sessionFixture,
        updated_at: "2026-07-03T10:05:02Z",
      },
      proposed_actions: [proposal],
    });
    mockedChat.executeAction.mockResolvedValue({
      status: "executed",
      message: "Task created",
      action: proposal,
      link: "/plan",
      entity_id: 42,
    });

    const user = userEvent.setup();
    renderPage();

    const title = await screen.findByText("Focus Sprint");
    await user.click(title.closest("button") as HTMLButtonElement);

    await user.type(screen.getByPlaceholderText("Message Shadow…"), "Add a focus block");
    await user.click(screen.getByLabelText("Send message"));

    await waitFor(() => expect(mockedChat.executeAction).toHaveBeenCalledWith(1, proposal, false));
    expect(await screen.findByText("Done")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute("href", "/plan");
  });

  it("does not auto-run milestone proposals and uses compact save action", async () => {
    const proposal = {
      id: "act-m-1",
      module: "goals",
      type: "goals.add_milestone",
      title: "Add milestone: Reach 5KG",
      rationale: "Proposed milestone from goal breakdown.",
      confidence: "high",
      requires_confirmation: false,
      destructive: false,
      args: { goal_id: 9, title: "Reach 5KG", order: 0 },
    } as const;
    mockedChat.send.mockResolvedValue({
      user_message: {
        id: 151,
        session_id: 1,
        role: "user",
        content: "Break my goal into milestones",
        agent_type: "general",
        created_at: "2026-07-03T10:05:00Z",
      },
      assistant_message: {
        id: 152,
        session_id: 1,
        role: "assistant",
        content: "Here is a milestone plan.",
        agent_type: "general",
        created_at: "2026-07-03T10:05:02Z",
      },
      session: {
        ...sessionFixture,
        updated_at: "2026-07-03T10:05:02Z",
      },
      proposed_actions: [proposal],
    });

    const user = userEvent.setup();
    renderPage();

    const title = await screen.findByText("Focus Sprint");
    await user.click(title.closest("button") as HTMLButtonElement);

    await user.type(screen.getByPlaceholderText("Message Shadow…"), "Break my goal into milestones");
    await user.click(screen.getByLabelText("Send message"));

    await screen.findByRole("button", { name: "Save" });
    expect(screen.queryByRole("button", { name: "Skip" })).not.toBeInTheDocument();
    expect(screen.getByText("Milestone")).toBeInTheDocument();
    expect(screen.getByText("Reach 5KG")).toBeInTheDocument();
    expect(screen.queryByText("Add milestone: Reach 5KG")).not.toBeInTheDocument();
    expect(mockedChat.executeAction).not.toHaveBeenCalled();
  });

  it("asks confirmation for uncertain proposals before execution", async () => {
    const proposal = {
      id: "act-2",
      module: "goals",
      type: "goals.create_goal",
      title: "Create learning goal",
      rationale: "This may need your confirmation.",
      confidence: "medium",
      requires_confirmation: true,
      destructive: false,
      args: { title: "Learn system design" },
    } as const;
    mockedChat.send.mockResolvedValue({
      user_message: {
        id: 201,
        session_id: 1,
        role: "user",
        content: "Maybe add a learning goal",
        agent_type: "general",
        created_at: "2026-07-03T10:06:00Z",
      },
      assistant_message: {
        id: 202,
        session_id: 1,
        role: "assistant",
        content: "I can propose that.",
        agent_type: "general",
        created_at: "2026-07-03T10:06:03Z",
      },
      session: {
        ...sessionFixture,
        updated_at: "2026-07-03T10:06:03Z",
      },
      proposed_actions: [proposal],
    });
    mockedChat.executeAction.mockResolvedValue({
      status: "executed",
      message: "Goal created",
      action: proposal,
      link: "/goals/9",
      entity_id: 9,
    });

    const user = userEvent.setup();
    renderPage();

    const title = await screen.findByText("Focus Sprint");
    await user.click(title.closest("button") as HTMLButtonElement);

    await user.type(screen.getByPlaceholderText("Message Shadow…"), "Maybe add a learning goal");
    await user.click(screen.getByLabelText("Send message"));

    await user.click(await screen.findByRole("button", { name: "Confirm and run" }));
    await user.click(screen.getByRole("button", { name: "Run action" }));

    await waitFor(() => expect(mockedChat.executeAction).toHaveBeenCalledWith(1, proposal, true));
    expect(await screen.findByText("Done")).toBeInTheDocument();
  });

  it("keeps goal context when chat is opened from goal detail", async () => {
    const coachSession = {
      id: 7,
      agent_type: "goal_coach",
      title: "Get SDE Job at Google",
      goal_id: 42,
      created_at: "2026-07-03T11:00:00Z",
      updated_at: "2026-07-03T11:00:00Z",
    } as const;
    mockedChat.sessions.mockResolvedValue([]);
    mockedChat.createSession.mockResolvedValue(coachSession);
    mockedChat.send.mockImplementation(async (_sessionId: number, sentContent: string) => ({
      user_message: {
        id: 301,
        session_id: coachSession.id,
        role: "user",
        content: sentContent,
        agent_type: "goal_coach",
        created_at: "2026-07-03T11:01:00Z",
      },
      assistant_message: {
        id: 302,
        session_id: coachSession.id,
        role: "assistant",
        content: "Sure — let's break this specific goal into milestones.",
        agent_type: "goal_coach",
        created_at: "2026-07-03T11:01:02Z",
      },
      session: {
        ...coachSession,
        updated_at: "2026-07-03T11:01:02Z",
      },
      proposed_actions: [],
    }));

    const user = userEvent.setup();
    renderPage("/assistant?agent=goal_coach&goalId=42");

    await waitFor(() =>
      expect(mockedChat.createSession).toHaveBeenCalledWith({
        agent_type: "goal_coach",
        title: "Goal Coach",
        goal_id: 42,
      }),
    );

    await user.type(screen.getByPlaceholderText("Message Goal Coach…"), "Break my goal into milestones");
    await user.click(screen.getByLabelText("Send message"));

    await waitFor(() => expect(mockedChat.send).toHaveBeenCalledWith(7, "Break my goal into milestones"));
    const sentPayload = mockedChat.send.mock.calls[0][1] as string;
    expect(sentPayload).toContain("Break my goal into milestones");
    expect(sentPayload).not.toContain("[goal_context]");

    expect(await screen.findByText("Break my goal into milestones")).toBeInTheDocument();
  });

  it("reuses existing goal-linked goal coach chat instead of creating a new one", async () => {
    const existingCoachSession = {
      id: 11,
      agent_type: "goal_coach",
      title: "Get SDE Job at Google",
      goal_id: 42,
      created_at: "2026-07-03T12:00:00Z",
      updated_at: "2026-07-03T12:15:00Z",
    } as const;
    mockedChat.sessions.mockResolvedValue([existingCoachSession]);

    renderPage("/assistant?agent=goal_coach&goalId=42");

    await waitFor(() => expect(mockedChat.messages).toHaveBeenCalledWith(11));
    expect(mockedChat.createSession).not.toHaveBeenCalled();
    expect((await screen.findAllByText("Get SDE Job at Google")).length).toBeGreaterThan(0);
  });

  it("shows selected chat title in header and highlights active sidebar chat", async () => {
    const coachSession = {
      id: 9,
      agent_type: "goal_coach",
      title: "Lose 10KG weight by October end",
      goal_id: 27,
      created_at: "2026-07-03T12:00:00Z",
      updated_at: "2026-07-03T12:10:00Z",
    } as const;

    mockedChat.sessions.mockResolvedValue([sessionFixture, coachSession]);

    const user = userEvent.setup();
    renderPage();

    const listTitle = await screen.findByText("Lose 10KG weight by October end");
    await user.click(listTitle.closest("button") as HTMLButtonElement);

    await waitFor(() => expect(mockedChat.messages).toHaveBeenCalledWith(9));
    expect(screen.getAllByText("Lose 10KG weight by October end").length).toBeGreaterThan(1);

    const activeItem = document.querySelector(".chat-session-item.active");
    expect(activeItem).not.toBeNull();
    expect(activeItem).toHaveTextContent("Lose 10KG weight by October end");
  });

  it("prefills composer when suggestion is clicked and waits for manual send", async () => {
    const coachSession = {
      id: 12,
      agent_type: "goal_coach",
      title: "Get SDE Job at Google",
      goal_id: 27,
      created_at: "2026-07-03T12:00:00Z",
      updated_at: "2026-07-03T12:10:00Z",
    } as const;

    mockedChat.sessions.mockResolvedValue([coachSession]);
    mockedChat.send.mockResolvedValue({
      user_message: {
        id: 401,
        session_id: coachSession.id,
        role: "user",
        content: "Break my goal into milestones with monthly checkpoints",
        agent_type: "goal_coach",
        created_at: "2026-07-03T12:11:00Z",
      },
      assistant_message: {
        id: 402,
        session_id: coachSession.id,
        role: "assistant",
        content: "Great, let's split it month by month.",
        agent_type: "goal_coach",
        created_at: "2026-07-03T12:11:02Z",
      },
      session: {
        ...coachSession,
        updated_at: "2026-07-03T12:11:02Z",
      },
      proposed_actions: [],
    });

    const user = userEvent.setup();
    renderPage();

    const listTitle = await screen.findByText("Get SDE Job at Google");
    await user.click(listTitle.closest("button") as HTMLButtonElement);

    const suggestion = await screen.findByRole("button", { name: "Break my goal into milestones" });
    await user.click(suggestion);

    const composer = screen.getByPlaceholderText("Message Goal Coach…") as HTMLTextAreaElement;
    expect(composer.value).toBe("Break my goal into milestones");
    expect(mockedChat.send).not.toHaveBeenCalled();

    await user.type(composer, " with monthly checkpoints");
    await user.click(screen.getByLabelText("Send message"));

    await waitFor(() =>
      expect(mockedChat.send).toHaveBeenCalledWith(
        coachSession.id,
        "Break my goal into milestones with monthly checkpoints",
      ),
    );
  });
});
