import { http, BASE_URL } from "./client";
import { ENDPOINTS } from "@/constant/bo-endpoints";
import { getToken } from "@/lib/auth-token";
import type { AppTarget, RestartLog, ServerHealth, WorkerInfo } from "./types";

// A native browser WebSocket can't set an Authorization header on its
// handshake the way axios does for normal requests, so the token travels
// as a WebSocket subprotocol instead (the backend's _ws_bearer_token
// reads it from there) — not a query parameter: the server's own access
// log records a request's full path *including* its query string, which
// would otherwise write the raw token into a plaintext log file on every
// single connection. A JWT's base64url alphabet (letters, digits, "-",
// "_", ".") never collides with the characters a WS subprotocol name
// forbids, so it travels here as-is, no encoding needed.
function tokenProtocols(): string[] | undefined {
  const token = getToken();
  return token ? [token] : undefined;
}

export const serverApi = {
  // One-time snapshot — used by the Dashboard, which just wants "what's
  // the state right now" on load, not a live feed.
  async health(app: AppTarget): Promise<ServerHealth> {
    return http.get<ServerHealth>(ENDPOINTS.SERVER.health(app));
  },
  // The Server page's live view — a WebSocket the backend pushes a fresh
  // snapshot over every few seconds, instead of this page polling
  // GET /server/{app}/health on a timer (each poll ran real psutil scanning
  // plus a request to the target app, whether or not anything had changed).
  // Not a normal request — the caller opens this itself via WebSocket,
  // so this just builds the URL, converting http(s) to ws(s) since
  // that's the scheme WebSocket actually needs.
  healthWsUrl(app: AppTarget): string {
    return `${BASE_URL}${ENDPOINTS.SERVER.healthWs(app)}`.replace(/^http/, "ws");
  },
  // Passed as the WebSocket constructor's `protocols` argument alongside
  // healthWsUrl — see tokenProtocols above for why it travels this way.
  healthWsProtocols(): string[] | undefined {
    return tokenProtocols();
  },
  async workers(app: AppTarget): Promise<WorkerInfo[]> {
    return http.get<WorkerInfo[]>(ENDPOINTS.SERVER.workers(app));
  },
  // The Logs page's live feed — same "the caller opens this itself"
  // shape as healthWsUrl above, just for the target app's log file instead
  // of a health snapshot. Paused by default: the Logs page only opens this
  // WebSocket once the user clicks play, never on page load.
  logWsUrl(app: AppTarget): string {
    return `${BASE_URL}${ENDPOINTS.SERVER.logWs(app)}`.replace(/^http/, "ws");
  },
  logWsProtocols(): string[] | undefined {
    return tokenProtocols();
  },
  async restart(app: AppTarget): Promise<RestartLog> {
    return http.post<RestartLog>(ENDPOINTS.SERVER.restart(app));
  },
  async restartDetail(app: AppTarget, id: number): Promise<RestartLog> {
    return http.get<RestartLog>(ENDPOINTS.SERVER.restartDetail(app, id));
  },
  async restartHistory(app: AppTarget, page: number, pageSize: number): Promise<RestartLog[]> {
    return http.get<RestartLog[]>(ENDPOINTS.SERVER.restartHistory(app), {
      params: { page, page_size: pageSize },
    });
  },
};

