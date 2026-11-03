import { http } from "@/api/client";
import { ENDPOINTS } from "@/constant/shadow-endpoints";
import type { SubscriptionOverview } from "@/api/types";

const BASE = ENDPOINTS.SUBSCRIPTION.PREFIX;

export const subscriptionApi = {
  get(): Promise<SubscriptionOverview> {
    return http.get<SubscriptionOverview>(`${BASE}${ENDPOINTS.SUBSCRIPTION.ROOT}`);
  },
  /** Buys a paid plan, and returns the overview as it is after the purchase. */
  purchase(planCode: string): Promise<SubscriptionOverview> {
    return http.post<SubscriptionOverview>(`${BASE}${ENDPOINTS.SUBSCRIPTION.PURCHASE}`, { plan_code: planCode });
  },
};
