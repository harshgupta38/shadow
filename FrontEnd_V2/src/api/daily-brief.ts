import { ENDPOINTS } from "@/constant/shadow-endpoints";
import { http } from "@/api/client";
import type { DailyBriefResponse } from "@/api/types";

const P = ENDPOINTS.DAILY_BRIEF.PREFIX;

export const dailyBriefApi = {
  async get(date?: string): Promise<DailyBriefResponse> {
    const params = date ? { date } : {};
    return http.get<DailyBriefResponse>(`${P}${ENDPOINTS.DAILY_BRIEF.DETAIL}`, { params });
  },

  async generate(date: string): Promise<DailyBriefResponse> {
    return http.post<DailyBriefResponse>(`${P}${ENDPOINTS.DAILY_BRIEF.GENERATE}`, undefined, { params: { date } });
  },

  /** Fetches (and server-side caches) TTS audio for a brief. First call for a given
   * date takes a couple seconds while it's generated; repeat calls are instant. */
  async getAudio(date: string): Promise<Blob> {
    return http.get<Blob>(`${P}${ENDPOINTS.DAILY_BRIEF.AUDIO}`, {
      params: { date },
      responseType: "blob",
    });
  },
};
