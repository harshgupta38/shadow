import { http } from "@/api/client";
import { ENDPOINTS } from "@/constant/shadow-endpoints";
import type { AIProvider, FullSettings } from "@/api/types";

export type {
  ThemePreferenceValue,
  AIResponseLength,
  AIPersonality,
  WeekStartsOn,
  TimeFormat,
  DateFormat,
  AIModel,
  AIProvider,
  AppearanceSettings,
  NotificationSettings,
  AIBehaviorSettings,
  PlannerSettings,
  PrivacySettings,
  AccessibilitySettings,
  FullSettings,
} from "@/api/types";

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
  exportData(): Promise<Blob> {
    return http.get<Blob>(BASE + ENDPOINTS.SETTINGS.EXPORT, { responseType: "blob" });
  },
  clearChatHistory(): Promise<void> {
    return http.delete<void>(BASE + ENDPOINTS.SETTINGS.CHAT_HISTORY);
  },
};
