import { ENDPOINTS } from "@/constant/shadow-endpoints";

import { http } from "@/api/client";
import {
    GoalDataResponse,
    GoalDataShortResponse,
    GoalListStatusFilter, 
    RefineGoalResponse,
    RefineGoalRequest, 
    RefineGoalFromLLMSchema
} from "@/api/types";

export const goalsApi = {
    async understandGoal(data: RefineGoalRequest): Promise<RefineGoalResponse> {
        return http.post<RefineGoalResponse>(`${ENDPOINTS.GOALS.PREFIX}${ENDPOINTS.GOALS.REFINE}`, data);
    },

    async saveGoal(data: RefineGoalFromLLMSchema): Promise<void> {
        return http.post<void>(`${ENDPOINTS.GOALS.PREFIX}${ENDPOINTS.GOALS.SAVE}`, data);
    },

    async getList(status: GoalListStatusFilter): Promise<GoalDataShortResponse[]> {
        return http.get<GoalDataShortResponse[]>(`${ENDPOINTS.GOALS.PREFIX}${ENDPOINTS.GOALS.GET_LIST}`, {
            params: { status },
        });
    },

    async getDetail(goalId: number): Promise<GoalDataResponse> {
        return http.get<GoalDataResponse>(`${ENDPOINTS.GOALS.PREFIX}${ENDPOINTS.GOALS.DETAIL(goalId)}`);
    },

    async deleteGoal(goalId: number): Promise<void> {
        return http.delete<void>(`${ENDPOINTS.GOALS.PREFIX}${ENDPOINTS.GOALS.DETAIL(goalId)}`);
    },

    async updateGoal(goalId: number, data: RefineGoalFromLLMSchema): Promise<GoalDataResponse> {
        return http.patch<GoalDataResponse>(`${ENDPOINTS.GOALS.PREFIX}${ENDPOINTS.GOALS.DETAIL(goalId)}`, data);
    },
};
