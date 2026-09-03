import { ENDPOINTS } from "@/constant/shadow-endpoints";
import { http } from "@/api/client";
import type { HabitDataResponse, HabitCreateRequest, HabitHistoryResponse, HabitUpdateRequest } from "@/api/types";

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

    async getHistory(id: number, params?: { skip?: number; limit?: number }): Promise<HabitHistoryResponse> {
        return http.get<HabitHistoryResponse>(
            `${ENDPOINTS.HABITS.PREFIX}${ENDPOINTS.HABITS.HISTORY(id)}`,
            { params: { skip: params?.skip ?? 0, limit: params?.limit ?? 30 } },
        );
    },
};
