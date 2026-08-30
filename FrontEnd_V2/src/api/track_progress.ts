import { ENDPOINTS } from "@/constant/shadow-endpoints";
import { http } from "@/api/client";
import type { HabitTrackItem } from "@/api/types";

export const trackProgressApi = {
    async getHabits(): Promise<HabitTrackItem[]> {
        return http.get<HabitTrackItem[]>(`${ENDPOINTS.TRACK_PROGRESS.PREFIX}${ENDPOINTS.TRACK_PROGRESS.HABITS}`);
    },

    async setTracking(enabledIds: number[]): Promise<void> {
        return http.post<void>(`${ENDPOINTS.TRACK_PROGRESS.PREFIX}${ENDPOINTS.TRACK_PROGRESS.SET_TRACKING}`, { enabled_ids: enabledIds });
    },
};
