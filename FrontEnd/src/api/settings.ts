import { http } from "./client";
import type {
  AccessibilitySettingsUpdate,
  AIBehaviorSettingsUpdate,
  AppearanceSettingsUpdate,
  DynamicAppearanceResolveResponse,
  EmailNotificationControls,
  EmailNotificationControlsUpdate,
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
  async getEmailNotificationControls(): Promise<EmailNotificationControls> {
    return http.get<EmailNotificationControls>("/settings/email-notifications");
  },
  async updateEmailNotificationControls(
    data: EmailNotificationControlsUpdate,
  ): Promise<EmailNotificationControls> {
    return http.put<EmailNotificationControls>("/settings/email-notifications", data);
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
        // Dynamic polling should always hit the backend decision endpoint.
        bypassCache: true,
        ttlMs: 0,
      },
    );
  },
};
