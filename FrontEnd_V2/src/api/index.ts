/**
 * Barrel for the typed API layer. Import the grouped `api` object anywhere:
 *
 *   import { api } from "@/api";
 *   const goals = await api.goals.list();
 */
export * from "./types";
export { tokenStore } from "./client";

import { authApi } from "./auth";
import { appearanceApi } from "./appearance";
import { goalsApi } from "./goals";

export const api = {
  auth: authApi,
  theme: appearanceApi,
  goals: goalsApi,
};

export type Api = typeof api;