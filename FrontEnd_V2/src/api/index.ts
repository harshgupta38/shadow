/**
 * Barrel for the typed API layer. Import the grouped `api` object anywhere:
 *
 *   import { api } from "@/api";
 *   const goals = await api.goals.list();
 */
export * from "@/api/types";
export { tokenStore } from "@/api/client";

import { authApi } from "@/api/auth";
import { appearanceApi } from "@/api/appearance";
import { goalsApi } from "@/api/goals";
import { milestonesApi } from "@/api/milestones";
import { tasksApi } from "@/api/tasks";

export const api = {
  auth: authApi,
  theme: appearanceApi,
  goals: goalsApi,
  milestones: milestonesApi,
  tasks: tasksApi,
};

export type Api = typeof api;