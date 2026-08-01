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
import { onboardingApi } from "./onboarding";

export const api = {
  auth: authApi,
  theme: appearanceApi,
  onboarding: onboardingApi,
};

export type Api = typeof api;