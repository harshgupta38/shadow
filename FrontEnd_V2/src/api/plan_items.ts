import { ENDPOINTS } from "@/constant/shadow-endpoints";
import { http } from "@/api/client";
import type { DailyPlanSavedData, PlanResponse, UpdatePlanRequest } from "@/api/types";

export const planItemsApi = {
  async getForDate(date: string): Promise<PlanResponse> {
    return http.get<PlanResponse>(`${ENDPOINTS.PLAN_ITEMS.PREFIX}${ENDPOINTS.PLAN_ITEMS.FOR_DATE}`, {
      params: { date },
    });
  },

  async updateRecord(recordId: number, body: UpdatePlanRequest): Promise<DailyPlanSavedData> {
    return http.patch<DailyPlanSavedData>(
      `${ENDPOINTS.PLAN_ITEMS.PREFIX}${ENDPOINTS.PLAN_ITEMS.RECORD(recordId)}`,
      body,
    );
  },
};
