import { ENDPOINTS } from "@/constant/shadow-endpoints";
import { http, refreshAccessToken } from "@/api/client";
import type { Notification, PushPublicKeyResponse, PushSubscriptionPayload } from "@/api/types";

const P = ENDPOINTS.NOTIFICATIONS.PREFIX;

// ─── SSE fetch-based stream reader ────────────────────────────────────────────
// Uses fetch + credentials:include so cookies are sent automatically.

/** Thrown when the stream's initial connection is rejected with 401 — distinct
 * from other failures so `stream()` knows a token refresh (not just a retry)
 * is what's needed. */
class SSEUnauthorizedError extends Error {}

async function readSSEStream(
  url: string,
  signal: AbortSignal,
  onData: (data: string) => void,
): Promise<void> {
  const response = await fetch(url, {
    credentials: "include",
    headers: { Accept: "text/event-stream" },
    signal,
  });

  if (!response.ok) {
    if (response.status === 401) throw new SSEUnauthorizedError();
    throw new Error(`SSE error: ${response.status}`);
  }
  if (!response.body) return;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE blocks are delimited by double newline
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop()!; // keep the incomplete trailing block
    for (const block of blocks) {
      for (const line of block.split("\n")) {
        if (line.startsWith("data: ")) {
          onData(line.slice(6));
        }
      }
    }
  }
}

// ─── API client ───────────────────────────────────────────────────────────────

export const notificationsApi = {
  async list(unreadOnly = false, limit = 50, beforeId?: number): Promise<Notification[]> {
    const params: Record<string, unknown> = { limit };
    if (unreadOnly) params.unread_only = true;
    if (beforeId !== undefined) params.before_id = beforeId;
    return http.get<Notification[]>(P, { params });
  },

  async markRead(id: number): Promise<Notification> {
    return http.patch<Notification>(`${P}${ENDPOINTS.NOTIFICATIONS.MARK_READ(id)}`);
  },

  async markReadBatch(ids: number[]): Promise<void> {
    return http.patch<void>(`${P}${ENDPOINTS.NOTIFICATIONS.MARK_READ_BATCH}`, { ids });
  },

  async markAllRead(): Promise<void> {
    return http.patch<void>(`${P}${ENDPOINTS.NOTIFICATIONS.MARK_ALL_READ}`);
  },

  async delete(id: number): Promise<void> {
    return http.delete<void>(`${P}${ENDPOINTS.NOTIFICATIONS.DETAIL(id)}`);
  },

  // ─── Push ─────────────────────────────────────────────────────────────────

  async getPushPublicKey(): Promise<PushPublicKeyResponse> {
    return http.get<PushPublicKeyResponse>(`${P}${ENDPOINTS.NOTIFICATIONS.PUSH_PUBLIC_KEY}`);
  },

  async subscribePush(payload: PushSubscriptionPayload): Promise<void> {
    return http.post<void>(`${P}${ENDPOINTS.NOTIFICATIONS.PUSH_SUBSCRIBE}`, payload);
  },

  async unsubscribePush(payload: PushSubscriptionPayload): Promise<void> {
    return http.delete<void>(`${P}${ENDPOINTS.NOTIFICATIONS.PUSH_UNSUBSCRIBE}`, payload);
  },

  async sendDeviceConnectedAlert(endpoint: string): Promise<void> {
    return http.post<void>(`${P}${ENDPOINTS.NOTIFICATIONS.PUSH_DEVICE_CONNECTED_ALERT}`, { endpoint });
  },

  /**
   * Opens a fetch-based SSE stream. Cookies are sent automatically via
   * credentials:include. Calls `onNotification` for each notification received.
   * Resolves when the stream ends or the AbortSignal fires.
   *
   * The server caps each connection at 20 minutes (see notifications.py). On
   * 401 the client refreshes the session once and retries the connection.
   */
  async stream(
    sinceId: number,
    onNotification: (n: Notification) => void,
    signal: AbortSignal,
  ): Promise<void> {
    const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api";
    const url = `${base}${P}${ENDPOINTS.NOTIFICATIONS.STREAM}?since_id=${sinceId}`;

    const onData = (data: string) => {
      try {
        onNotification(JSON.parse(data) as Notification);
      } catch { /* malformed event, ignore */ }
    };

    try {
      await readSSEStream(url, signal, onData);
    } catch (err) {
      if (!(err instanceof SSEUnauthorizedError) || signal.aborted) throw err;
      await refreshAccessToken();
      await readSSEStream(url, signal, onData);
    }
  },
};
