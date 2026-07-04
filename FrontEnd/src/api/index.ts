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
import { repetitiveTasksApi } from "./repetitiveTasks";
import { reportsApi } from "./reports";
import { settingsApi } from "./settings";

export const api = {
  auth: authApi,
  onboarding: onboardingApi,
  profile: profileApi,
  settings: settingsApi,
  goals: goalsApi,
  chat: chatApi,
  journal: journalApi,
  notifications: notificationsApi,
  metrics: metricsApi,
  plan: planApi,
  repetitiveTasks: repetitiveTasksApi,
  reports: reportsApi,
  dashboard: dashboardApi,
};

export type Api = typeof api;
