import { http, BASE_URL } from "./client";
import { ENDPOINTS } from "@/constant/bo-endpoints";
import { getToken } from "@/lib/auth-token";
import type { RestartLog, ServerHealth, WorkerInfo } from "./types";

// A native browser WebSocket can't set an Authorization header on its
// handshake the way axios does for normal requests, so the auth token
// travels as a query param instead — the backend's _authenticate_ws reads
// it from there. Same token, just a different place to carry it.
function withToken(url: string): string {
  const token = getToken();
  return token ? `${url}?token=${encodeURIComponent(token)}` : url;
}

export const serverApi = {
  // One-time snapshot — used by the Dashboard, which just wants "what's
  // the state right now" on load, not a live feed.
  async health(): Promise<ServerHealth> {
    return http.get<ServerHealth>(ENDPOINTS.SERVER.HEALTH);
  },
  // The Server page's live view — a WebSocket the backend pushes a fresh
  // snapshot over every few seconds, instead of this page polling
  // GET /server/health on a timer (each poll ran real psutil scanning
  // plus a request to BackEnd_V2, whether or not anything had changed).
  // Not a normal request — the caller opens this itself via WebSocket,
  // so this just builds the URL, converting http(s) to ws(s) since
  // that's the scheme WebSocket actually needs.
  healthWsUrl(): string {
    return withToken(`${BASE_URL}${ENDPOINTS.SERVER.HEALTH_WS}`.replace(/^http/, "ws"));
  },
  async workers(): Promise<WorkerInfo[]> {
    return http.get<WorkerInfo[]>(ENDPOINTS.SERVER.WORKERS);
  },
  // The Logs page's live feed — same "the caller opens this itself"
  // shape as healthWsUrl above, just for server.log instead of a health
  // snapshot. Paused by default: the Logs page only opens this
  // WebSocket once the user clicks play, never on page load.
  logWsUrl(): string {
    return withToken(`${BASE_URL}${ENDPOINTS.SERVER.LOG_WS}`.replace(/^http/, "ws"));
  },
  async restart(): Promise<RestartLog> {
    return http.post<RestartLog>(ENDPOINTS.SERVER.RESTART);
  },
  async restartDetail(id: number): Promise<RestartLog> {
    return http.get<RestartLog>(ENDPOINTS.SERVER.restartDetail(id));
  },
  async restartHistory(page: number, pageSize: number): Promise<RestartLog[]> {
    return http.get<RestartLog[]>(ENDPOINTS.SERVER.RESTART_HISTORY, {
      params: { page, page_size: pageSize },
    });
  },
};
