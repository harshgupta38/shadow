import { ENDPOINTS } from "@/constant/shadow-endpoints";

import { http } from "@/api/client";
import { TaskCreateRequest, TaskDataResponse, TaskUpdateRequest } from "@/api/types";

export const tasksApi = {
    async save(data: TaskCreateRequest): Promise<TaskDataResponse> {
        return http.post<TaskDataResponse>(`${ENDPOINTS.TASKS.PREFIX}${ENDPOINTS.TASKS.SAVE}`, data);
    },

    async getList(milestoneId: number): Promise<TaskDataResponse[]> {
        return http.get<TaskDataResponse[]>(`${ENDPOINTS.TASKS.PREFIX}${ENDPOINTS.TASKS.GET_LIST}`, {
            params: { milestone_id: milestoneId },
        });
    },

    async update(taskId: number, data: TaskUpdateRequest): Promise<TaskDataResponse> {
        return http.patch<TaskDataResponse>(`${ENDPOINTS.TASKS.PREFIX}${ENDPOINTS.TASKS.DETAIL(taskId)}`, data);
    },

    async remove(taskId: number): Promise<void> {
        return http.delete<void>(`${ENDPOINTS.TASKS.PREFIX}${ENDPOINTS.TASKS.DETAIL(taskId)}`);
    },
};
