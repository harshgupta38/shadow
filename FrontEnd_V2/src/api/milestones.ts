import { ENDPOINTS } from "@/constant/shadow-endpoints";

import { http } from "./client";
import { MilestoneCreateRequest, MilestoneCreateResponse } from "./types";

export const milestonesApi = {
    async create(data: MilestoneCreateRequest): Promise<MilestoneCreateResponse> {
        return http.post<MilestoneCreateResponse>(`${ENDPOINTS.MILESTONES.PREFIX}${ENDPOINTS.MILESTONES.SAVE}`, data);
    },
};
