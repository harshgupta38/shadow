import { http } from "./client";
import type {
  OnboardingAnswerRequest,
  OnboardingAnswerResponse,
  OnboardingQuestion,
  User,
} from "./types";

export const onboardingApi = {
  async questions(): Promise<OnboardingQuestion[]> {
    return http.get<OnboardingQuestion[]>("/onboarding/questions");
  },
  async answer(data: OnboardingAnswerRequest): Promise<OnboardingAnswerResponse> {
    return http.post<OnboardingAnswerResponse>("/onboarding/answer", data);
  },
  async complete(): Promise<User> {
    return http.post<User>("/onboarding/complete");
  },
};
