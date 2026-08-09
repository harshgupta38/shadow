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

export const api = {
  auth: authApi,
  theme: appearanceApi,
  goals: goalsApi,
  milestones: milestonesApi,
};

export type Api = typeof api;