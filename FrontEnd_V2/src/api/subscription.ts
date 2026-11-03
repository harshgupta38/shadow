import { http } from "@/api/client";
import { ENDPOINTS } from "@/constant/shadow-endpoints";
import type { SubscriptionAllowance, SubscriptionOverview, SubscriptionPlan } from "@/api/types";

const BASE = ENDPOINTS.SUBSCRIPTION.PREFIX;

// The previous backend names the allowance `monthly_tokens`; the current one sends `daily_tokens`. Reading either keeps the plan
// pages working while the two are deployed at different times. Delete this block once the current backend is live everywhere,
// and let `get` and `purchase` return the response as it is.
type TokenFields = { daily_tokens?: number; monthly_tokens?: number };
type RawOverview = Omit<SubscriptionOverview, "plan" | "plans" | "allowance"> & {
  plan: Omit<SubscriptionPlan, "daily_tokens"> & TokenFields;
  plans: (Omit<SubscriptionPlan, "daily_tokens"> & TokenFields)[];
  allowance: Omit<SubscriptionAllowance, "daily_tokens"> & TokenFields;
};

function withDailyTokens<T extends TokenFields>({ monthly_tokens, daily_tokens, ...rest }: T) {
  return { ...rest, daily_tokens: daily_tokens ?? monthly_tokens ?? 0 };
}

function normalise(raw: RawOverview): SubscriptionOverview {
  return {
    ...raw,
    plan: withDailyTokens(raw.plan),
    plans: raw.plans.map(withDailyTokens),
    allowance: withDailyTokens(raw.allowance),
  };
}

export const subscriptionApi = {
  async get(): Promise<SubscriptionOverview> {
    return normalise(await http.get<RawOverview>(`${BASE}${ENDPOINTS.SUBSCRIPTION.ROOT}`));
  },
  /** Buys a paid plan, and returns the overview as it is after the purchase. */
  async purchase(planCode: string): Promise<SubscriptionOverview> {
    return normalise(await http.post<RawOverview>(`${BASE}${ENDPOINTS.SUBSCRIPTION.PURCHASE}`, { plan_code: planCode }));
  },
};
