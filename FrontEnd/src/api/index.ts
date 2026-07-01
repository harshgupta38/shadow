/**
 * Barrel for the typed API layer. Import the grouped `api` object anywhere:
 *
 *   import { api } from "@/api";
 *   const goals = await api.goals.list();
 */
export * from "./types";
export { ApiError, tokenStore, UNAUTHORIZED_EVENT } from "./client";

import { authApi } from "./auth";
import { chatApi } from "./chat";
import { dashboardApi } from "./dashboard";
import { goalsApi } from "./goals";
import { journalApi } from "./journal";
import { metricsApi } from "./metrics";
import { notificationsApi } from "./notifications";
import { onboardingApi } from "./onboarding";
import { planApi } from "./plan";
import { profileApi } from "./profile";
import { reportsApi } from "./reports";

export const api = {
  auth: authApi,
  onboarding: onboardingApi,
  profile: profileApi,
  goals: goalsApi,
  chat: chatApi,
  journal: journalApi,
  notifications: notificationsApi,
  metrics: metricsApi,
  plan: planApi,
  reports: reportsApi,
  dashboard: dashboardApi,
};

export type Api = typeof api;
