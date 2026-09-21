import { http, BASE_URL } from "./client";
import { ENDPOINTS } from "@/constant/bo-endpoints";
import type { RestartLog, ServerHealth, WorkerInfo } from "./types";

export const serverApi = {
  async health(): Promise<ServerHealth> {
    return http.get<ServerHealth>(ENDPOINTS.SERVER.HEALTH);
  },
  async workers(): Promise<WorkerInfo[]> {
    return http.get<WorkerInfo[]>(ENDPOINTS.SERVER.WORKERS);
  },
  // Not a normal request — EventSource opens this itself (LiveLogTail),
  // only once the person clicks play, so this just builds the URL.
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
