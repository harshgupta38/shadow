import { ENDPOINTS } from "@/constant/shadow-endpoints";
import { http } from "@/api/client";
import type { HabitTrackItem } from "@/api/types";

export const trackProgressApi = {
    async getHabits(): Promise<HabitTrackItem[]> {
        return http.get<HabitTrackItem[]>(`${ENDPOINTS.TRACK_PROGRESS.PREFIX}${ENDPOINTS.TRACK_PROGRESS.HABITS}`);
    },
};
