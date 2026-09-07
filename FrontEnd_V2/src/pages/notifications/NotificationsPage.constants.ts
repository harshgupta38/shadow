import { BellFill, InfoCircleFill, Stars } from "react-bootstrap-icons";

import type { Notification, NotificationType } from "@/api/types";

export const TYPE_ICON: Record<NotificationType, typeof BellFill> = {
  reminder: BellFill,
  system: InfoCircleFill,
  agent: Stars,
};

export const TYPE_COLOR: Record<NotificationType, string> = {
  reminder: "var(--jv-brand-1)",
  system: "var(--jv-info)",
  agent: "var(--jv-warn)",
};

export const MOCK_NOTIFICATIONS: Notification[] = [
  { id: 1, title: "Daily Report Ready", body: "Your daily report for today has been generated.", type: "system", read: false, created_at: new Date(Date.now() - 5 * 60_000).toISOString(), url: "/reports/2026-09-07" },
  { id: 2, title: "Weekly Report Ready", body: "Your weekly report for this week is ready to view.", type: "system", read: false, created_at: new Date(Date.now() - 2 * 3600_000).toISOString(), url: "/reports" },
  { id: 3, title: "Task reminder: LeetCode POTD", body: null, type: "reminder", read: true, created_at: new Date(Date.now() - 24 * 3600_000).toISOString() },
];
