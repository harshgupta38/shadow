import { ENDPOINTS } from "@/constant/shadow-endpoints";

import { http } from "@/api/client";
import { TaskCreateRequest, TaskResponse } from "@/api/types";

export const tasksApi = {
    async save(data: TaskCreateRequest): Promise<TaskResponse> {
        return http.post<TaskResponse>(`${ENDPOINTS.TASKS.PREFIX}${ENDPOINTS.TASKS.SAVE}`, data);
    },

    async getList(milestoneId: number): Promise<TaskResponse[]> {
        return http.get<TaskResponse[]>(`${ENDPOINTS.TASKS.PREFIX}${ENDPOINTS.TASKS.GET_LIST}`, {
            params: { milestone_id: milestoneId },
        });
    },
};
