import { ENDPOINTS } from "@/constant/shadow-endpoints";
import { http } from "@/api/client";
import type { EligibleHabitItem, EligibleTaskItem, HabitTrackItem, TaskTrackItem } from "@/api/types";

export const trackProgressApi = {
    async getHabits(): Promise<HabitTrackItem[]> {
        return http.get<HabitTrackItem[]>(`${ENDPOINTS.TRACK_PROGRESS.PREFIX}${ENDPOINTS.TRACK_PROGRESS.HABITS}`);
    },

    async getEligibleHabits(): Promise<EligibleHabitItem[]> {
        return http.get<EligibleHabitItem[]>(`${ENDPOINTS.TRACK_PROGRESS.PREFIX}${ENDPOINTS.TRACK_PROGRESS.ELIGIBLE_HABITS}`);
    },

    async setTracking(enabledIds: number[]): Promise<void> {
        return http.post<void>(`${ENDPOINTS.TRACK_PROGRESS.PREFIX}${ENDPOINTS.TRACK_PROGRESS.SET_TRACKING}`, { enabled_ids: enabledIds });
    },

    async getTasks(): Promise<TaskTrackItem[]> {
        return http.get<TaskTrackItem[]>(`${ENDPOINTS.TRACK_PROGRESS.PREFIX}${ENDPOINTS.TRACK_PROGRESS.TASKS}`);
    },

    async getEligibleTasks(): Promise<EligibleTaskItem[]> {
        return http.get<EligibleTaskItem[]>(`${ENDPOINTS.TRACK_PROGRESS.PREFIX}${ENDPOINTS.TRACK_PROGRESS.ELIGIBLE_TASKS}`);
    },

    async setTaskTracking(enabledIds: number[]): Promise<void> {
        return http.post<void>(`${ENDPOINTS.TRACK_PROGRESS.PREFIX}${ENDPOINTS.TRACK_PROGRESS.SET_TASK_TRACKING}`, { enabled_ids: enabledIds });
    },
};
