import { PRIORITY_ORDER } from "@/pages/plan/DayOverviewPanel/DayOverviewPanel.constants";
import type { DashboardTodayItem, TimeFormat } from "@/api";
import { formatTime } from "@/services/date.service";

export function computeCompletion(items: DashboardTodayItem[]): number {
  if (items.length === 0) return 0;
  const sum = items.reduce((total, item) => {
    if (item.planner_type === "metric" && (item.planner_target ?? 0) > 0) {
      return total + Math.min(1, item.current_value / item.planner_target!);
    }
    return total + (item.status === "done" ? 1 : 0);
  }, 0);
  return Math.round((sum / items.length) * 100);
}

export function topUndoneItems(items: DashboardTodayItem[], limit = 3): DashboardTodayItem[] {
  return items
    .filter((item) => item.status === "due")
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
    .slice(0, limit);
}

export function remainingLabel(item: DashboardTodayItem): string {
  const target = item.planner_target ?? 0;
  if (item.current_value < target) return `${target - item.current_value} ${item.value_unit ?? "items"} left`;
  if (item.current_value === target) return "Target Reached 🥳";
  return "Few extra steps for better future";
}

export function timeLabel(item: DashboardTodayItem, format: TimeFormat = "12h"): string | null {
  if (item.preferred_time === "custom") return item.specific_time ? formatTime(item.specific_time, format) : null;
  if (item.preferred_time === "flexible") return null;
  return item.preferred_time.charAt(0).toUpperCase() + item.preferred_time.slice(1);
}

export function completionMessage(percentage: number): string {
  if (percentage >= 100) return "All done, you crushed it today.";
  if (percentage >= 75) return "Almost there, finish strong.";
  if (percentage >= 50) return "Halfway done, keep the momentum.";
  if (percentage >= 25) return "Good start, keep going.";
  if (percentage > 0) return "You've made a start, keep going.";
  return "Let's get today started.";
}
