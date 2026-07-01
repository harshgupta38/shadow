import { http } from "./client";
import type { DashboardSummary } from "./types";

export const dashboardApi = {
  async summary(): Promise<DashboardSummary> {
    return http.get<DashboardSummary>("/dashboard/summary");
  },
};
