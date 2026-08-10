import { ENDPOINTS } from "@/constant/shadow-endpoints";

import { http } from "@/api/client";
import { TaskCreateRequest, TaskResponse } from "@/api/types";

export const tasksApi = {
    async save(data: TaskCreateRequest): Promise<TaskResponse> {
        return http.post<TaskResponse>(`${ENDPOINTS.TASKS.PREFIX}${ENDPOINTS.TASKS.SAVE}`, data);
    },
};
