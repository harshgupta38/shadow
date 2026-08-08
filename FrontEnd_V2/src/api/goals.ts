import { ENDPOINTS } from "@/constant/shadow-endpoints";

import { http } from "./client";
import {
    GoalDetailResponse,
    GoalListItemResponse, 
    GoalListStatusFilter, 
    RefineGoalResponse,
    UnderstandGoalRequest, 
    UnderstandGoalResponse
} from "./types";

export const goalsApi = {
    async understandGoal(data: UnderstandGoalRequest): Promise<RefineGoalResponse> {
        return http.post<RefineGoalResponse>(`${ENDPOINTS.GOALS.PREFIX}${ENDPOINTS.GOALS.REFINE}`, data);
    },

    async saveGoal(data: UnderstandGoalResponse): Promise<UnderstandGoalResponse> {
        return http.post<UnderstandGoalResponse>(`${ENDPOINTS.GOALS.PREFIX}${ENDPOINTS.GOALS.SAVE}`, data);
    },

    async getList(status: GoalListStatusFilter): Promise<GoalListItemResponse[]> {
        return http.get<GoalListItemResponse[]>(`${ENDPOINTS.GOALS.PREFIX}${ENDPOINTS.GOALS.GET_LIST}`, {
            params: { status },
        });
    },

    async getDetail(goalId: number): Promise<GoalDetailResponse> {
        return http.get<GoalDetailResponse>(`${ENDPOINTS.GOALS.PREFIX}${ENDPOINTS.GOALS.DETAIL(goalId)}`);
    },

    async deleteGoal(goalId: number): Promise<void> {
        return http.delete<void>(`${ENDPOINTS.GOALS.PREFIX}${ENDPOINTS.GOALS.DETAIL(goalId)}`);
    },

    async updateGoal(goalId: number, data: UnderstandGoalResponse): Promise<GoalDetailResponse> {
        return http.patch<GoalDetailResponse>(`${ENDPOINTS.GOALS.PREFIX}${ENDPOINTS.GOALS.DETAIL(goalId)}`, data);
    },
};
