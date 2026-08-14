import { ENDPOINTS } from "@/constant/shadow-endpoints";

import { http } from "@/api/client";
import { MilestoneCreateRequest, MilestoneDataResponse, MilestoneStatus, MilestoneUpdateRequest } from "@/api/types";

export const milestonesApi = {
    async save(data: MilestoneCreateRequest): Promise<MilestoneDataResponse> {
        return http.post<MilestoneDataResponse>(`${ENDPOINTS.MILESTONES.PREFIX}${ENDPOINTS.MILESTONES.SAVE}`, data);
    },

    async getList(goalId: number, status?: MilestoneStatus): Promise<MilestoneDataResponse[]> {
        const params = new URLSearchParams();
        params.append("goal_id", String(goalId));
        if (status)
            params.append("status", status);
        return http.get<MilestoneDataResponse[]>(`${ENDPOINTS.MILESTONES.PREFIX}${ENDPOINTS.MILESTONES.GET_LIST}?${params.toString()}`);
    },

    async getDetail(milestoneId: number): Promise<MilestoneDataResponse> {
        return http.get<MilestoneDataResponse>(`${ENDPOINTS.MILESTONES.PREFIX}${ENDPOINTS.MILESTONES.DETAIL(milestoneId)}`);
    },

    async update(milestoneId: number, data: MilestoneUpdateRequest): Promise<MilestoneDataResponse> {
        return http.patch<MilestoneDataResponse>(`${ENDPOINTS.MILESTONES.PREFIX}${ENDPOINTS.MILESTONES.DETAIL(milestoneId)}`, data);
    },

    async remove(milestoneId: number): Promise<void> {
        return http.delete<void>(`${ENDPOINTS.MILESTONES.PREFIX}${ENDPOINTS.MILESTONES.DETAIL(milestoneId)}`);
    },
};
