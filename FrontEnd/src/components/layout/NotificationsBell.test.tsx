import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { api, type Notification } from "@/api";

import { NotificationsBell } from "./NotificationsBell";

vi.mock("@/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      notifications: {
        ...actual.api.notifications,
        list: vi.fn(),
        markRead: vi.fn(),
      },
    },
  };
});

const mockedNotificationsApi = api.notifications as unknown as {
  list: Mock;
  markRead: Mock;
};

function buildNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 1,
    title: "Daily Brief",
    body: "Review your top tasks.",
    type: "system",
    related_goal_id: null,
    scheduled_at: null,
    sent: true,
    read: false,
    created_at: "2026-07-09T10:00:00Z",
    ...overrides,
  };
}

describe("NotificationsBell", () => {
  beforeEach(() => {
    mockedNotificationsApi.list.mockReset();
    mockedNotificationsApi.markRead.mockReset();

    let listCallCount = 0;
    mockedNotificationsApi.list.mockImplementation(async () => {
      listCallCount += 1;
      if (listCallCount === 1) {
        return [
          buildNotification({ id: 1, read: false }),
          buildNotification({ id: 2, title: "Reminder", read: false }),
          buildNotification({ id: 3, title: "Already read", read: true }),
        ];
      }
      return [
        buildNotification({ id: 1, read: true }),
        buildNotification({ id: 2, title: "Reminder", read: true }),
        buildNotification({ id: 3, title: "Already read", read: true }),
      ];
    });
    mockedNotificationsApi.markRead.mockResolvedValue(buildNotification({ read: true }));
  });

  it("marks visible unread notifications as read when popup opens", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <NotificationsBell />
      </MemoryRouter>,
    );

    const bellButton = await screen.findByRole("button", {
      name: "2 unread notifications",
    });

    await user.click(bellButton);

    await waitFor(() => {
      expect(mockedNotificationsApi.markRead).toHaveBeenCalledTimes(2);
    });

    expect(mockedNotificationsApi.markRead).toHaveBeenCalledWith(1);
    expect(mockedNotificationsApi.markRead).toHaveBeenCalledWith(2);

    await waitFor(() => {
      expect(screen.getByTitle("Notifications")).toBeInTheDocument();
    });

    await user.click(screen.getByTitle("Notifications"));

    await waitFor(() => {
      expect(mockedNotificationsApi.list).toHaveBeenCalledTimes(2);
    });

    await user.click(screen.getByTitle("Notifications"));

    await waitFor(() => {
      expect(mockedNotificationsApi.markRead).toHaveBeenCalledTimes(2);
    });

    expect(screen.getByText("No unread notifications.")).toBeInTheDocument();
  });
});
