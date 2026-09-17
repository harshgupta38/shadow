import { http } from "@/api/client";
import { ENDPOINTS } from "@/constant/shadow-endpoints";
import type { ProfileResponse, UpdateBioRequest } from "@/api/types";

const BASE = ENDPOINTS.PROFILE.PREFIX;

export const profileApi = {
  get(): Promise<ProfileResponse> {
    return http.get<ProfileResponse>(`${BASE}${ENDPOINTS.PROFILE.ROOT}`);
  },
  updateBio(data: UpdateBioRequest): Promise<ProfileResponse> {
    return http.patch<ProfileResponse>(`${BASE}${ENDPOINTS.PROFILE.BIO}`, data);
  },
};
