import { http } from "./client";
import { ENDPOINTS } from "@/constant/bo-endpoints";
import type { AppUser, CreateAdminRequest } from "./types";

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
};
