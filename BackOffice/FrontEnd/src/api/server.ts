import { http, BASE_URL } from "./client";
import { ENDPOINTS } from "@/constant/bo-endpoints";
import type { RestartLog, ServerHealth, WorkerInfo } from "./types";

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
    return `${BASE_URL}${ENDPOINTS.SERVER.HEALTH_WS}`.replace(/^http/, "ws");
  },
  async workers(): Promise<WorkerInfo[]> {
    return http.get<WorkerInfo[]>(ENDPOINTS.SERVER.WORKERS);
  },
  // Not a normal request — a log viewer opens this itself via
  // EventSource, so this just builds the URL. Not called from the
  // Server page anymore (logs are moving to their own page); kept here
  // since the backend stream itself is already built and ready for it.
  logStreamUrl(): string {
    return `${BASE_URL}${ENDPOINTS.SERVER.LOG_STREAM}`;
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
