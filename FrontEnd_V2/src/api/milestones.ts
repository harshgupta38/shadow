import { ENDPOINTS } from "@/constant/shadow-endpoints";

import { http } from "@/api/client";
import { MilestoneCreateRequest, MilestoneResponse, MilestoneStatus, MilestoneUpdateRequest } from "@/api/types";

export const milestonesApi = {
    async save(data: MilestoneCreateRequest): Promise<MilestoneResponse> {
        return http.post<MilestoneResponse>(`${ENDPOINTS.MILESTONES.PREFIX}${ENDPOINTS.MILESTONES.SAVE}`, data);
    },

    async getList(goalId: number, status?: MilestoneStatus): Promise<MilestoneResponse[]> {
        const params = new URLSearchParams();
        params.append("goal_id", String(goalId));
        if (status)
            params.append("status", status);
        return http.get<MilestoneResponse[]>(`${ENDPOINTS.MILESTONES.PREFIX}${ENDPOINTS.MILESTONES.GET_LIST}?${params.toString()}`);
    },

    async getDetail(milestoneId: number): Promise<MilestoneResponse> {
        return http.get<MilestoneResponse>(`${ENDPOINTS.MILESTONES.PREFIX}${ENDPOINTS.MILESTONES.DETAIL(milestoneId)}`);
    },

    async update(milestoneId: number, data: MilestoneUpdateRequest): Promise<MilestoneResponse> {
        return http.patch<MilestoneResponse>(`${ENDPOINTS.MILESTONES.PREFIX}${ENDPOINTS.MILESTONES.DETAIL(milestoneId)}`, data);
    },

    async remove(milestoneId: number): Promise<void> {
        return http.delete<void>(`${ENDPOINTS.MILESTONES.PREFIX}${ENDPOINTS.MILESTONES.DETAIL(milestoneId)}`);
    },
};
