import { ENDPOINTS } from "@/constant/shadow-endpoints";

import { http } from "@/api/client";
import { MilestoneCreateRequest, MilestoneCreateResponse, MilestoneStatus, MilestoneUpdateRequest } from "@/api/types";

export const milestonesApi = {
    async save(data: MilestoneCreateRequest): Promise<MilestoneCreateResponse> {
        return http.post<MilestoneCreateResponse>(`${ENDPOINTS.MILESTONES.PREFIX}${ENDPOINTS.MILESTONES.SAVE}`, data);
    },

    async getList(goalId: number, status?: MilestoneStatus): Promise<MilestoneCreateResponse[]> {
        const params = new URLSearchParams();
        params.append("goal_id", String(goalId));
        if (status)
            params.append("status", status);
        return http.get<MilestoneCreateResponse[]>(`${ENDPOINTS.MILESTONES.PREFIX}${ENDPOINTS.MILESTONES.GET_LIST}?${params.toString()}`);
    },

    async update(milestoneId: number, data: MilestoneUpdateRequest): Promise<MilestoneCreateResponse> {
        return http.patch<MilestoneCreateResponse>(`${ENDPOINTS.MILESTONES.PREFIX}${ENDPOINTS.MILESTONES.DETAIL(milestoneId)}`, data);
    },

    async remove(milestoneId: number): Promise<void> {
        return http.delete<void>(`${ENDPOINTS.MILESTONES.PREFIX}${ENDPOINTS.MILESTONES.DETAIL(milestoneId)}`);
    },
};
