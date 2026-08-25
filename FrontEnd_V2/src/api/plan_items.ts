import { ENDPOINTS } from "@/constant/shadow-endpoints";
import { http } from "@/api/client";
import type { PlanResponse } from "@/api/types";

export const planItemsApi = {
  async getToday(date: string): Promise<PlanResponse> {
    return http.get<PlanResponse>(`${ENDPOINTS.PLAN_ITEMS.PREFIX}${ENDPOINTS.PLAN_ITEMS.GET_TODAY}`, {
      params: { date },
    });
  },
};
