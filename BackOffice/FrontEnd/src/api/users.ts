import { http } from "./client";
import { ENDPOINTS } from "@/constant/bo-endpoints";
import type { AppUser, CreateAdminRequest, DeleteUserResponse } from "./types";

export const usersApi = {
  async shadow(): Promise<AppUser[]> {
    return http.get<AppUser[]>(ENDPOINTS.USERS.SHADOW);
  },
  async backoffice(): Promise<AppUser[]> {
    return http.get<AppUser[]>(ENDPOINTS.USERS.BACKOFFICE);
  },
  async createBackofficeAdmin(data: CreateAdminRequest): Promise<AppUser> {
    return http.post<AppUser>(ENDPOINTS.USERS.BACKOFFICE, data);
  },
  async deleteShadow(userId: number, confirmEmail: string): Promise<DeleteUserResponse> {
    return http.delete<DeleteUserResponse>(ENDPOINTS.USERS.shadowDelete(userId), { confirm_email: confirmEmail });
  },
};
