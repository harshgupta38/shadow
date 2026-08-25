import { ENDPOINTS } from "@/constant/shadow-endpoints";

import { http } from "@/api/client";
import { SaveTaskFromProposalRequest, TaskCreateRequest, TaskDataResponse, TaskUpdateRequest } from "@/api/types";

export const tasksApi = {
    async save(data: TaskCreateRequest): Promise<TaskDataResponse> {
        return http.post<TaskDataResponse>(`${ENDPOINTS.TASKS.PREFIX}${ENDPOINTS.TASKS.SAVE}`, data);
    },

    async saveFromProposal(data: SaveTaskFromProposalRequest): Promise<TaskDataResponse> {
        return http.post<TaskDataResponse>(`${ENDPOINTS.TASKS.PREFIX}${ENDPOINTS.TASKS.FROM_PROPOSAL}`, data);
    },

    async getList(milestoneId: number): Promise<TaskDataResponse[]> {
        return http.get<TaskDataResponse[]>(`${ENDPOINTS.TASKS.PREFIX}${ENDPOINTS.TASKS.GET_LIST}`, {
            params: { milestone_id: milestoneId },
        });
    },

    async getDetail(taskId: number): Promise<TaskDataResponse> {
        return http.get<TaskDataResponse>(`${ENDPOINTS.TASKS.PREFIX}${ENDPOINTS.TASKS.DETAIL(taskId)}`);
    },

    async update(taskId: number, data: TaskUpdateRequest): Promise<TaskDataResponse> {
        return http.patch<TaskDataResponse>(`${ENDPOINTS.TASKS.PREFIX}${ENDPOINTS.TASKS.DETAIL(taskId)}`, data);
    },

    async remove(taskId: number): Promise<void> {
        return http.delete<void>(`${ENDPOINTS.TASKS.PREFIX}${ENDPOINTS.TASKS.DETAIL(taskId)}`);
    },
};
