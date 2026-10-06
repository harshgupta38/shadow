import { ArrowDownRight, ArrowUpRight, DashLg } from "react-bootstrap-icons";

// Shared across plan, schedule, and habit-tracking — all use the same five-value priority union.
export type Priority = "highest" | "high" | "medium" | "low" | "lowest";

export const PRIORITY_LABEL: Record<Priority, string> = {
  highest: "Highest",
  high: "High",
  medium: "Medium",
  low: "Low",
  lowest: "Lowest",
};

export const PRIORITY_COLOR: Record<Priority, string> = {
  highest: "var(--jv-danger)",
  high: "var(--jv-warn)",
  medium: "var(--jv-info)",
  low: "var(--jv-muted)",
  lowest: "var(--jv-faint)",
};

export function PriorityIcon({ priority, size = 11 }: { priority: Priority; size?: number }) {
  if (priority === "highest" || priority === "high") return <ArrowUpRight size={size} />;
  if (priority === "low" || priority === "lowest") return <ArrowDownRight size={size} />;
  return <DashLg size={size} />;
}
