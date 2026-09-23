import { ENDPOINTS } from "@/constant/shadow-endpoints";
import { http } from "@/api/client";
import type { DailyBriefCaptionsResponse, DailyBriefResponse, WordTiming } from "@/api/types";

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

  /** Real per-word timestamps from transcribing the generated audio, for caption
   * sync. Only call after getAudio has resolved for the same date — captions are
   * cached alongside the audio and won't exist until it's been generated. */
  async getCaptions(date: string): Promise<WordTiming[]> {
    const res = await http.get<DailyBriefCaptionsResponse>(`${P}${ENDPOINTS.DAILY_BRIEF.CAPTIONS}`, { params: { date } });
    return res.words;
  },
};
