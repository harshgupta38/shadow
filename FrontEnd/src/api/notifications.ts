import { http } from "./client";
import type {
  DeviceConnectedAlertRequest,
  Notification,
  NotificationCreate,
  PushPublicKeyRead,
  PushSubscriptionDelete,
  PushSubscriptionUpsert,
} from "./types";

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
  async getPushPublicKey(): Promise<PushPublicKeyRead> {
    return http.get<PushPublicKeyRead>("/notifications/push/public-key", undefined, {
      bypassCache: true,
    });
  },
  async subscribe(data: PushSubscriptionUpsert): Promise<void> {
    await http.post<void>("/notifications/push/subscriptions", data);
  },
  async unsubscribe(data: PushSubscriptionDelete): Promise<void> {
    await http.del("/notifications/push/subscriptions", data);
  },
  async notifyDeviceConnected(data: DeviceConnectedAlertRequest): Promise<void> {
    await http.post<void>("/notifications/push/device-connected-alert", data);
  },
};
