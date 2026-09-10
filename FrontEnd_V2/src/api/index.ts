/**
 * Barrel for the typed API layer. Import the grouped `api` object anywhere:
 *
 *   import { api } from "@/api";
 *   const goals = await api.goals.list();
 */
export * from "@/api/types";
export { tokenStore, ApiError } from "@/api/client";

import { authApi } from "@/api/auth";
import { notificationsApi } from "@/api/notifications";
import { appearanceApi } from "@/api/appearance";
import { reportsApi } from "@/api/reports";
import { chatApi } from "@/api/chat";
import { dashboardApi } from "@/api/dashboard";
import { goalsApi } from "@/api/goals";
import { milestonesApi } from "@/api/milestones";
import { tasksApi } from "@/api/tasks";
import { habitsApi } from "@/api/habits";
import { planItemsApi } from "@/api/plan_items";
import { scheduleApi } from "@/api/schedule";
import { settingsApi } from "@/api/settings";

export const api = {
  auth: authApi,
  notifications: notificationsApi,
  theme: appearanceApi,
  chat: chatApi,
  dashboard: dashboardApi,
  goals: goalsApi,
  milestones: milestonesApi,
  tasks: tasksApi,
  habits: habitsApi,
  planItems: planItemsApi,
  schedule: scheduleApi,
  reports: reportsApi,
  settings: settingsApi,
};

export type Api = typeof api;