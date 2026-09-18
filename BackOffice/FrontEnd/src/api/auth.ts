import { http } from "./client";
import { ENDPOINTS } from "@/constant/bo-endpoints";
import type { AuthUser, LoginRequest } from "./types";

export const authApi = {
  async login(data: LoginRequest): Promise<AuthUser> {
    return http.post<AuthUser>(ENDPOINTS.AUTH.LOGIN, data);
  },
  async me(): Promise<AuthUser> {
    return http.get<AuthUser>(ENDPOINTS.AUTH.ME);
  },
  async logout(): Promise<void> {
    return http.post<void>(ENDPOINTS.AUTH.LOGOUT);
  },
};
