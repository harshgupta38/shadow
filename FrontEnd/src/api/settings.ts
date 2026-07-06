import { http } from "./client";
import type {
  AccessibilitySettingsUpdate,
  AIBehaviorSettingsUpdate,
  AppearanceSettingsUpdate,
  DynamicAppearanceResolveResponse,
  IntegrationSettingsUpdate,
  NotificationSettingsUpdate,
  PlannerSettingsUpdate,
  PrivacySettingsUpdate,
  SettingsRead,
} from "./types";

export const settingsApi = {
  async get(): Promise<SettingsRead> {
    return http.get<SettingsRead>("/settings");
  },
  async updateAppearance(data: AppearanceSettingsUpdate): Promise<SettingsRead> {
    return http.put<SettingsRead>("/settings/appearance", data);
  },
  async updateNotifications(data: NotificationSettingsUpdate): Promise<SettingsRead> {
    return http.put<SettingsRead>("/settings/notifications", data);
  },
  async updateAIBehavior(data: AIBehaviorSettingsUpdate): Promise<SettingsRead> {
    return http.put<SettingsRead>("/settings/ai-behavior", data);
  },
  async updateIntegrations(data: IntegrationSettingsUpdate): Promise<SettingsRead> {
    return http.put<SettingsRead>("/settings/integrations", data);
  },
  async updateAccessibility(data: AccessibilitySettingsUpdate): Promise<SettingsRead> {
    return http.put<SettingsRead>("/settings/accessibility", data);
  },
  async updatePlanner(data: PlannerSettingsUpdate): Promise<SettingsRead> {
    return http.put<SettingsRead>("/settings/planner", data);
  },
  async updatePrivacy(data: PrivacySettingsUpdate): Promise<SettingsRead> {
    return http.put<SettingsRead>("/settings/privacy", data);
  },
  async resolveDynamicAppearance(
    latitude: number,
    longitude: number,
  ): Promise<DynamicAppearanceResolveResponse> {
    return http.get<DynamicAppearanceResolveResponse>(
      "/settings/appearance/dynamic-resolve",
      { latitude, longitude },
      {
        // Keep this short so sunrise/sunset transitions can refresh naturally.
        ttlMs: 60_000,
      },
    );
  },
};
