import { http, httpText } from "./client";
import { ENDPOINTS } from "@/constant/bo-endpoints";
import type { RestartLog, ServerHealth, WorkerInfo } from "./types";

export const serverApi = {
  async health(): Promise<ServerHealth> {
    return http.get<ServerHealth>(ENDPOINTS.SERVER.HEALTH);
  },
  async workers(): Promise<WorkerInfo[]> {
    return http.get<WorkerInfo[]>(ENDPOINTS.SERVER.WORKERS);
  },
  async log(lines = 200): Promise<string> {
    return httpText(ENDPOINTS.SERVER.LOG, { params: { lines } });
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
