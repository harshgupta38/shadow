import { http } from "./client";
import type { Notification, NotificationCreate } from "./types";

export const notificationsApi = {
  async list(unreadOnly = false): Promise<Notification[]> {
    return http.get<Notification[]>(
      "/notifications",
      unreadOnly ? { unread_only: true } : undefined,
    );
  },
  async create(data: NotificationCreate): Promise<Notification> {
    return http.post<Notification>("/notifications", data);
  },
  async markRead(id: number): Promise<Notification> {
    return http.patch<Notification>(`/notifications/${id}/read`);
  },
};
