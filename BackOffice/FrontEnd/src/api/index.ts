import { authApi } from "./auth";

export const api = {
  auth: authApi,
};

export { ApiError } from "./client";
export type { AuthUser, LoginRequest } from "./types";
