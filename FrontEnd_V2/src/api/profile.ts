import { http } from "@/api/client";
import { ENDPOINTS } from "@/constant/shadow-endpoints";
import type { ProfileResponse } from "@/api/types";

const BASE = ENDPOINTS.PROFILE.PREFIX;

export const profileApi = {
  get(): Promise<ProfileResponse> {
    return http.get<ProfileResponse>(`${BASE}${ENDPOINTS.PROFILE.ROOT}`);
  },
  updateBio(bio: string): Promise<ProfileResponse> {
    return http.patch<ProfileResponse>(`${BASE}${ENDPOINTS.PROFILE.BIO}`, { bio });
  },
};
