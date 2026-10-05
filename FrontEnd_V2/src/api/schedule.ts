import { ENDPOINTS } from "@/constant/shadow-endpoints";
import { http } from "@/api/client";
import type {
    SubtaskCreateRequest,
    SubtaskResponse,
    SubtaskUpdateRequest,
    SaveScheduledTaskFromProposalRequest,
    ScheduledTaskCreateRequest,
    ScheduledTaskDataResponse,
    ScheduledTaskUpdateRequest,
} from "@/api/types";

export const scheduleApi = {
    async save(data: ScheduledTaskCreateRequest): Promise<ScheduledTaskDataResponse> {
        return http.post<ScheduledTaskDataResponse>(`${ENDPOINTS.SCHEDULE.PREFIX}${ENDPOINTS.SCHEDULE.SAVE}`, data);
    },

    async saveFromProposal(data: SaveScheduledTaskFromProposalRequest): Promise<ScheduledTaskDataResponse> {
        return http.post<ScheduledTaskDataResponse>(`${ENDPOINTS.SCHEDULE.PREFIX}${ENDPOINTS.SCHEDULE.FROM_PROPOSAL}`, data);
    },

    async updateScheduleTask(id: number, data: ScheduledTaskUpdateRequest, isYearly = false): Promise<ScheduledTaskDataResponse> {
        const qs = isYearly ? "?is_yearly=true" : "";
        return http.patch<ScheduledTaskDataResponse>(`${ENDPOINTS.SCHEDULE.PREFIX}${ENDPOINTS.SCHEDULE.DETAIL(id)}${qs}`, data);
    },

    async removeScheduleTask(id: number, isYearly = false): Promise<void> {
        const qs = isYearly ? "?is_yearly=true" : "";
        return http.delete<void>(`${ENDPOINTS.SCHEDULE.PREFIX}${ENDPOINTS.SCHEDULE.DETAIL(id)}${qs}`);
    },

    async getScheduleList(year: number, month: number): Promise<ScheduledTaskDataResponse[]> {
        return http.get<ScheduledTaskDataResponse[]>(
            `${ENDPOINTS.SCHEDULE.PREFIX}${ENDPOINTS.SCHEDULE.GET_LIST}?year=${year}&month=${month}`,
        );
    },

    async getScheduleTask(id: number, isYearly = false): Promise<ScheduledTaskDataResponse> {
        const qs = isYearly ? "?is_yearly=true" : "";
        return http.get<ScheduledTaskDataResponse>(
            `${ENDPOINTS.SCHEDULE.PREFIX}${ENDPOINTS.SCHEDULE.DETAIL(id)}${qs}`,
        );
    },

    async getSubtasks(taskId: number): Promise<SubtaskResponse[]> {
        return http.get<SubtaskResponse[]>(`${ENDPOINTS.SCHEDULE.PREFIX}${ENDPOINTS.SCHEDULE.SUBTASKS(taskId)}`);
    },

    async createSubtask(taskId: number, data: SubtaskCreateRequest): Promise<SubtaskResponse> {
        return http.post<SubtaskResponse>(`${ENDPOINTS.SCHEDULE.PREFIX}${ENDPOINTS.SCHEDULE.SUBTASKS(taskId)}`, data);
    },

    async updateSubtask(taskId: number, subtaskId: number, data: SubtaskUpdateRequest): Promise<SubtaskResponse> {
        return http.patch<SubtaskResponse>(`${ENDPOINTS.SCHEDULE.PREFIX}${ENDPOINTS.SCHEDULE.SUBTASK_DETAIL(taskId, subtaskId)}`, data);
    },

    async deleteSubtask(taskId: number, subtaskId: number): Promise<void> {
        return http.delete<void>(`${ENDPOINTS.SCHEDULE.PREFIX}${ENDPOINTS.SCHEDULE.SUBTASK_DETAIL(taskId, subtaskId)}`);
    },
};
