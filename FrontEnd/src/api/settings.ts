import { http } from "./client";
import type {
  AIBehaviorSettingsUpdate,
  AppearanceSettingsUpdate,
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
  async updatePlanner(data: PlannerSettingsUpdate): Promise<SettingsRead> {
    return http.put<SettingsRead>("/settings/planner", data);
  },
  async updatePrivacy(data: PrivacySettingsUpdate): Promise<SettingsRead> {
    return http.put<SettingsRead>("/settings/privacy", data);
  },
};
