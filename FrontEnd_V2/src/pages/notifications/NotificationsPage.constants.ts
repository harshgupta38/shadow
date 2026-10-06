import {
  BarChartFill,
  BellFill,
  BrightnessHighFill,
  Bullseye,
  CalendarCheckFill,
  CalendarWeek,
  ExclamationTriangleFill,
  Fire,
  HourglassSplit,
  InfoCircleFill,
  ListCheck,
  PhoneFill,
  ShieldFill,
  Stars,
  TrophyFill,
} from "react-bootstrap-icons";

import type { Notification, NotificationType } from "@/api/types";

export const TYPE_ICON: Record<NotificationType, typeof BellFill> = {
  system:      InfoCircleFill,
  reminder:    BellFill,
  agent:       Stars,
  security:    ShieldFill,
  warning:     ExclamationTriangleFill,
  achievement: TrophyFill,
};

export const TYPE_COLOR: Record<NotificationType, string> = {
  system:      "var(--jv-info)",
  reminder:    "var(--jv-brand-1)",
  agent:       "var(--jv-warn)",
  security:    "var(--jv-danger)",
  warning:     "var(--jv-warn)",
  achievement: "var(--jv-success)",
};

// ── Category overrides, keyed by the prefix of `event_key` (before the first ":") ──
// More specific than `type` — lets siblings from the same feature (e.g. daily and
// weekly reports, both "report:...") share one icon, while genuinely different
// notification kinds that happen to share the same `type` (e.g. "daily brief" vs
// "plan ready", both type="system") get visually distinct icons.
const CATEGORY_VISUAL: Record<string, { icon: typeof BellFill; color: string }> = {
  daily_brief:    { icon: BrightnessHighFill,       color: "var(--jv-warn)" },
  plan_ready:     { icon: CalendarCheckFill,        color: "var(--jv-brand-1)" },
  streak:         { icon: Fire,                     color: "var(--jv-warn)" },
  goal_due3:      { icon: Bullseye,                 color: "var(--jv-brand-1)" },
  ms_due3:        { icon: Bullseye,                 color: "var(--jv-brand-1)" },
  sched_reminder: { icon: CalendarWeek,             color: "var(--jv-brand-1)" },
  tasks_due:      { icon: ListCheck,                color: "var(--jv-brand-1)" },
  tasks_overdue:  { icon: ListCheck,                color: "var(--jv-danger)" },
  plan_reminder:  { icon: HourglassSplit,           color: "var(--jv-warn)" },
  habit_risk:     { icon: ExclamationTriangleFill,  color: "var(--jv-warn)" },
  welcome:        { icon: Stars,                    color: "var(--jv-warn)" },
  milestone_done: { icon: TrophyFill,               color: "var(--jv-success)" },
  goal_done:      { icon: TrophyFill,               color: "var(--jv-success)" },
  report:         { icon: BarChartFill,             color: "var(--jv-info)" },
  signin:         { icon: PhoneFill,                color: "var(--jv-danger)" },
};

/** Icon + color for a notification — category-specific when its event_key prefix
 * is recognised, falling back to the broad `type`-based mapping otherwise. */
export function getNotificationVisual(n: Notification): { Icon: typeof BellFill; color: string } {
  const prefix = n.event_key?.split(":")[0];
  const category = prefix ? CATEGORY_VISUAL[prefix] : undefined;
  if (category) return { Icon: category.icon, color: category.color };
  return { Icon: TYPE_ICON[n.type], color: TYPE_COLOR[n.type] };
}
