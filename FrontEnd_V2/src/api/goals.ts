import { ENDPOINTS } from "@/constant/shadow-endpoints";

import { http } from "./client";
import {
    GoalDetailResponse,
    GoalListItemResponse, 
    GoalListStatusFilter, 
    UnderstandGoalRequest, 
    UnderstandGoalResponse
} from "./types";

export const goalsApi = {
    async understandGoal(data: UnderstandGoalRequest): Promise<UnderstandGoalResponse> {
        return http.post<UnderstandGoalResponse>(`${ENDPOINTS.GOALS.PREFIX}${ENDPOINTS.GOALS.REFINE}`, data);
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
        return http.get<GoalDetailResponse>(`${ENDPOINTS.GOALS.PREFIX}/${goalId}`);
    },
};
