import { ENDPOINTS } from "@/constant/shadow-endpoints";

import { http } from "./client";
import { ApiErrorShape, FoundationData } from "./types";

export const onboardingApi = {
	async saveFoundation(data: FoundationData): Promise<ApiErrorShape> {
		return http.post<ApiErrorShape>(ENDPOINTS.ONBOARDING.FOUNDATION, data);
	},
};
