import { ENDPOINTS } from "@/constant/shadow-endpoints";

import { http } from "./client";
import { UnderstandGoalRequest } from "./types";

export const goalsApi = {
    async understandGoal(data: UnderstandGoalRequest): Promise<unknown> {
        return http.post<unknown>(`${ENDPOINTS.GOALS.PREFIX}${ENDPOINTS.GOALS.REFINE}`, data);
    },
};
