import { ENDPOINTS } from "@/constant/shadow-endpoints";
import { http, refreshAccessToken, tokenStore } from "@/api/client";
import type { Notification } from "@/api/types";

const P = ENDPOINTS.NOTIFICATIONS.PREFIX;

// ─── SSE fetch-based stream reader ────────────────────────────────────────────
// Uses fetch + Authorization header so no token ever appears in the URL.

/** Thrown when the stream's initial connection is rejected with 401 — distinct
 * from other failures so `stream()` knows a token refresh (not just a retry)
 * is what's needed. */
class SSEUnauthorizedError extends Error {}

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

  /**
   * Opens a fetch-based SSE stream. Token goes in the Authorization header — never in the URL.
   * Calls `onNotification` for each notification received. Resolves when the stream ends or
   * the AbortSignal fires.
   *
   * The server caps each connection at 20 minutes (see notifications.py), and the access
   * token can expire before that reconnect happens. Since this bypasses axios (fetch, for
   * streaming), it can't rely on the axios 401 interceptor — so a 401 here refreshes the
   * token once and retries the connection, instead of surfacing as a dead stream.
   */
  async stream(
    sinceId: number,
    onNotification: (n: Notification) => void,
    signal: AbortSignal,
  ): Promise<void> {
    const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000/api";
    const url = `${base}${P}${ENDPOINTS.NOTIFICATIONS.STREAM}?since_id=${sinceId}`;

    const onData = (data: string) => {
      try {
        onNotification(JSON.parse(data) as Notification);
      } catch { /* malformed event, ignore */ }
    };

    try {
      await readSSEStream(url, tokenStore.get() ?? "", signal, onData);
    } catch (err) {
      if (!(err instanceof SSEUnauthorizedError) || signal.aborted) throw err;
      const freshToken = await refreshAccessToken();
      await readSSEStream(url, freshToken, signal, onData);
    }
  },
};
