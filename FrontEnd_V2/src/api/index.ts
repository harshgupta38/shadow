/**
 * Barrel for the typed API layer. Import the grouped `api` object anywhere:
 *
 *   import { api } from "@/api";
 *   const goals = await api.goals.list();
 */
export * from "./types";
export { tokenStore } from "./client";

import { authApi } from "./auth";

export const api = {
  auth: authApi,
};

export type Api = typeof api;