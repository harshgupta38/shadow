/**
 * Barrel for the typed API layer. Import the grouped `api` object anywhere:
 *
 *   import { api } from "@/api";
 *   const goals = await api.goals.list();
 */
export * from "@/api/types";
export { tokenStore, ApiError } from "@/api/client";

import { authApi } from "@/api/auth";
import { appearanceApi } from "@/api/appearance";
import { chatApi } from "@/api/chat";
import { goalsApi } from "@/api/goals";
import { milestonesApi } from "@/api/milestones";
import { tasksApi } from "@/api/tasks";
import { habitsApi } from "@/api/habits";
import { planItemsApi } from "@/api/plan_items";

export const api = {
  auth: authApi,
  theme: appearanceApi,
  chat: chatApi,
  goals: goalsApi,
  milestones: milestonesApi,
  tasks: tasksApi,
  habits: habitsApi,
  planItems: planItemsApi,
};

export type Api = typeof api;