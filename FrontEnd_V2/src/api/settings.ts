import { http } from "@/api/client";
import { ENDPOINTS } from "@/constant/shadow-endpoints";
import type { AIProvider, AIProviderHealthCheckRequest, AIProviderHealthCheckResponse, FullSettings } from "@/api/types";

const BASE = ENDPOINTS.SETTINGS.PREFIX;

export const settingsApi = {
  get(): Promise<FullSettings> {
    return http.get<FullSettings>(BASE);
  },
  update(data: FullSettings): Promise<FullSettings> {
    return http.put<FullSettings>(BASE, data);
  },
  getProviders(): Promise<AIProvider[]> {
    return http.get<AIProvider[]>(BASE + ENDPOINTS.SETTINGS.AI_PROVIDERS);
  },
  checkProviderHealth(provider: string, model: string): Promise<AIProviderHealthCheckResponse> {
    const body: AIProviderHealthCheckRequest = { provider, model };
    return http.post<AIProviderHealthCheckResponse>(BASE + ENDPOINTS.SETTINGS.PROVIDER_HEALTH_CHECK, body);
  },
  exportData(): Promise<Blob> {
    return http.get<Blob>(BASE + ENDPOINTS.SETTINGS.EXPORT, { responseType: "blob" });
  },
  clearChatHistory(): Promise<void> {
    return http.delete<void>(BASE + ENDPOINTS.SETTINGS.CHAT_HISTORY);
  },
  getMemoryCount(): Promise<number> {
    return http.get<number>(BASE + ENDPOINTS.SETTINGS.MEMORIES_COUNT);
  },
};
