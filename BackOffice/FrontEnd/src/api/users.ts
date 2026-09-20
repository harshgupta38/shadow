import { http } from "./client";
import { ENDPOINTS } from "@/constant/bo-endpoints";
import type { AppUser } from "./types";

export const usersApi = {
  async shadow(): Promise<AppUser[]> {
    return http.get<AppUser[]>(ENDPOINTS.USERS.SHADOW);
  },
  async backoffice(): Promise<AppUser[]> {
    return http.get<AppUser[]>(ENDPOINTS.USERS.BACKOFFICE);
  },
};
