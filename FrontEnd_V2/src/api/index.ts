/**
 * Barrel for the typed API layer. Import the grouped `api` object anywhere:
 *
 *   import { api } from "@/api";
 *   const goals = await api.goals.list();
 */
export * from "@/api/types";
export { ApiError } from "@/api/client";

import { authApi } from "@/api/auth";
import { notificationsApi } from "@/api/notifications";
import { dailyBriefApi } from "@/api/daily-brief";
import { appearanceApi } from "@/api/appearance";
import { reportsApi } from "@/api/reports";
import { chatApi } from "@/api/chat";
import { dashboardApi } from "@/api/dashboard";
import { profileApi } from "@/api/profile";
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
  dailyBrief: dailyBriefApi,
  theme: appearanceApi,
  chat: chatApi,
  dashboard: dashboardApi,
  profile: profileApi,
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