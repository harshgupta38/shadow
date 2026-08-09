import { ENDPOINTS } from "@/constant/shadow-endpoints";

import { http } from "@/api/client";
import { MilestoneCreateRequest, MilestoneCreateResponse } from "@/api/types";

export const milestonesApi = {
    async create(data: MilestoneCreateRequest): Promise<MilestoneCreateResponse> {
        return http.post<MilestoneCreateResponse>(`${ENDPOINTS.MILESTONES.PREFIX}${ENDPOINTS.MILESTONES.SAVE}`, data);
    },
};
