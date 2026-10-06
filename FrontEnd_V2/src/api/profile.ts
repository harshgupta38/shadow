import { http } from "@/api/client";
import { ENDPOINTS } from "@/constant/shadow-endpoints";
import type { ProfileResponse, UpdateBioRequest, UsageResponse } from "@/api/types";

const BASE = ENDPOINTS.PROFILE.PREFIX;

export const profileApi = {
  get(): Promise<ProfileResponse> {
    return http.get<ProfileResponse>(`${BASE}${ENDPOINTS.PROFILE.ROOT}`);
  },
  updateBio(data: UpdateBioRequest): Promise<ProfileResponse> {
    return http.patch<ProfileResponse>(`${BASE}${ENDPOINTS.PROFILE.BIO}`, data);
  },
  getUsage(year: number, month: number): Promise<UsageResponse> {
    return http.get<UsageResponse>(`${BASE}${ENDPOINTS.PROFILE.USAGE}?year=${year}&month=${month}`);
  },
};
