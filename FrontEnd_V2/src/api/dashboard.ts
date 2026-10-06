import { DashboardResponse } from "@/api/types";
import { http } from "@/api/client";
import { ENDPOINTS } from "@/constant/shadow-endpoints";

const BASE = ENDPOINTS.DASHBOARD.PREFIX;

export const dashboardApi = {
  async get(): Promise<DashboardResponse> {
    return http.get<DashboardResponse>(`${BASE}${ENDPOINTS.DASHBOARD.ROOT}`);
  },
};
