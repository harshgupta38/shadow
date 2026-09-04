import type { PlanDataResponse, PlanPreferredTime, PlanPriority } from "@/api";

export const PRIORITY_ORDER: Record<PlanPriority, number> = {
  highest: 0, high: 1, medium: 2, low: 3, lowest: 4,
};

export const TIME_ORDER: Record<PlanPreferredTime, number> = {
  morning: 0, afternoon: 1, evening: 2, night: 3, custom: 4, flexible: 99,
};

export function activeItems(items: PlanDataResponse[]) {
  return items.filter(
    (i) => i.saved_data?.status !== "done" && i.saved_data?.status !== "missed",
  );
}

export function nextUpTimeLabel(item: PlanDataResponse): string {
  if (item.preferred_time === "custom" && item.specific_time) return item.specific_time;
  return item.preferred_time.charAt(0).toUpperCase() + item.preferred_time.slice(1);
}

export function focusSub(item: PlanDataResponse): string | null {
  if (item.planner_type === "metric" && (item.planner_target ?? 0) > 0) {
    const remaining = Math.max(0, (item.planner_target ?? 0) - (item.saved_data?.current_value ?? 0));
    return `${remaining} ${item.value_unit ?? "items"} remaining`;
  }
  return null;
}
