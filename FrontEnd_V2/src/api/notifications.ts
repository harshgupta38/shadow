import { ENDPOINTS } from "@/constant/shadow-endpoints";
import { http, tokenStore } from "@/api/client";
import type { Notification } from "@/api/types";

const P = ENDPOINTS.NOTIFICATIONS.PREFIX;

// ─── SSE fetch-based stream reader ────────────────────────────────────────────
// Uses fetch + Authorization header so no token ever appears in the URL.

async function readSSEStream(
  url: string,
  token: string,
  signal: AbortSignal,
  onData: (data: string) => void,
): Promise<void> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
    signal,
  });

  if (!response.ok) throw new Error(`SSE error: ${response.status}`);
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

  /**
   * Opens a fetch-based SSE stream. Token goes in the Authorization header — never in the URL.
   * Calls `onNotification` for each notification received. Resolves when the stream ends or
   * the AbortSignal fires.
   */
  async stream(
    sinceId: number,
    onNotification: (n: Notification) => void,
    signal: AbortSignal,
  ): Promise<void> {
    const token = tokenStore.get() ?? "";
    const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000/api";
    const url = `${base}${P}${ENDPOINTS.NOTIFICATIONS.STREAM}?since_id=${sinceId}`;

    await readSSEStream(url, token, signal, (data) => {
      try {
        onNotification(JSON.parse(data) as Notification);
      } catch { /* malformed event, ignore */ }
    });
  },
};
