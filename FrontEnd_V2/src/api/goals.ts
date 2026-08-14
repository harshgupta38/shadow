import { ENDPOINTS } from "@/constant/shadow-endpoints";

import { http } from "@/api/client";
import {
    GoalDetailResponse,
    GoalListItemResponse, 
    GoalListStatusFilter, 
    LLMRefineGoalResponse,
    UnderstandGoalRequest, 
    UnderstandGoalResponse
} from "@/api/types";

export const goalsApi = {
    async understandGoal(data: UnderstandGoalRequest): Promise<LLMRefineGoalResponse> {
        return http.post<LLMRefineGoalResponse>(`${ENDPOINTS.GOALS.PREFIX}${ENDPOINTS.GOALS.REFINE}`, data);
    },

    async saveGoal(data: UnderstandGoalResponse): Promise<void> {
        return http.post<void>(`${ENDPOINTS.GOALS.PREFIX}${ENDPOINTS.GOALS.SAVE}`, data);
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
