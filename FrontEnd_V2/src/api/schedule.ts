import { ENDPOINTS } from "@/constant/shadow-endpoints";
import { http } from "@/api/client";
import type { ScheduledTaskCreateRequest, ScheduledTaskDataResponse, ScheduledTaskUpdateRequest } from "@/api/types";

export const scheduleApi = {
    async save(data: ScheduledTaskCreateRequest): Promise<ScheduledTaskDataResponse> {
        return http.post<ScheduledTaskDataResponse>(`${ENDPOINTS.SCHEDULE.PREFIX}${ENDPOINTS.SCHEDULE.SAVE}`, data);
    },

    async updateScheduleTask(id: number, data: ScheduledTaskUpdateRequest): Promise<ScheduledTaskDataResponse> {
        return http.patch<ScheduledTaskDataResponse>(`${ENDPOINTS.SCHEDULE.PREFIX}${ENDPOINTS.SCHEDULE.DETAIL(id)}`, data);
    },

    async removeScheduleTask(id: number): Promise<void> {
        return http.delete<void>(`${ENDPOINTS.SCHEDULE.PREFIX}${ENDPOINTS.SCHEDULE.DETAIL(id)}`);
    },

    async getScheduleList(): Promise<ScheduledTaskDataResponse[]> {
        return http.get<ScheduledTaskDataResponse[]>(`${ENDPOINTS.SCHEDULE.PREFIX}${ENDPOINTS.SCHEDULE.GET_LIST}`);
    },
};
