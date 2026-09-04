import { ENDPOINTS } from "@/constant/shadow-endpoints";
import { http } from "@/api/client";
import type { HabitDataResponse, HabitCreateRequest, HabitActivityResponse, HabitUpdateRequest } from "@/api/types";

export const habitsApi = {
    async getList(params?: { goal_id?: number }): Promise<HabitDataResponse[]> {
        return http.get<HabitDataResponse[]>(`${ENDPOINTS.HABITS.PREFIX}${ENDPOINTS.HABITS.GET_LIST}`, { params });
    },

    async createHabit(data: HabitCreateRequest): Promise<HabitDataResponse> {
        return http.post<HabitDataResponse>(`${ENDPOINTS.HABITS.PREFIX}${ENDPOINTS.HABITS.SAVE}`, data);
    },

    async updateHabit(id: number, data: HabitUpdateRequest): Promise<HabitDataResponse> {
        return http.patch<HabitDataResponse>(`${ENDPOINTS.HABITS.PREFIX}${ENDPOINTS.HABITS.DETAIL(id)}`, data);
    },

    async removeHabit(id: number): Promise<void> {
        return http.delete<void>(`${ENDPOINTS.HABITS.PREFIX}${ENDPOINTS.HABITS.DETAIL(id)}`);
    },

    async getActivity(id: number): Promise<HabitActivityResponse> {
        return http.get<HabitActivityResponse>(
            `${ENDPOINTS.HABITS.PREFIX}${ENDPOINTS.HABITS.ACTIVITY(id)}`,
        );
    },
};
