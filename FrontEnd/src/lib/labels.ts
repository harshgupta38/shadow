import type {
  GoalStatus,
  JournalMood,
  MemoryCategory,
  MemorySource,
  MetricUnit,
  MilestoneStatus,
  NotificationType,
  PlannedTaskStatus,
} from "@/api";

type PillVariant = "success" | "warn" | "danger" | "info" | "brand" | "muted";

export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  archived: "Archived",
};

export const GOAL_STATUS_PILL: Record<GoalStatus, PillVariant> = {
  active: "info",
  paused: "warn",
  completed: "success",
  archived: "muted",
};

export const MILESTONE_STATUS_LABEL: Record<MilestoneStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};

export const MILESTONE_STATUS_PILL: Record<MilestoneStatus, PillVariant> = {
  todo: "muted",
  in_progress: "info",
  done: "success",
};

export const TASK_STATUS_LABEL: Record<PlannedTaskStatus, string> = {
  planned: "Planned",
  done: "Done",
  missed: "Missed",
};

export const TASK_STATUS_PILL: Record<PlannedTaskStatus, PillVariant> = {
  planned: "info",
  done: "success",
  missed: "danger",
};

export const MEMORY_CATEGORY_LABEL: Record<MemoryCategory, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  career: "Career",
  life: "Life",
  personality: "Personality",
  other: "Other",
};

export const MEMORY_SOURCE_LABEL: Record<MemorySource, string> = {
  onboarding: "Onboarding",
  chat: "From chat",
  manual: "Added by you",
  behavior: "Learned",
};

export const METRIC_UNIT_LABEL: Record<MetricUnit, string> = {
  count: "Count",
  minutes: "Minutes",
  hours: "Hours",
  custom: "Custom",
};

export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  reminder: "Reminder",
  system: "System",
  agent: "From Shadow",
};

export const GOAL_CATEGORY_SUGGESTIONS = [
  "Career",
  "Health",
  "Learning",
  "Finance",
  "Personal",
  "Relationships",
];

export const MOOD_OPTIONS: ReadonlyArray<{ emoji: string; label: JournalMood }> = [
  { emoji: "😄", label: "Great" },
  { emoji: "🙂", label: "Good" },
  { emoji: "😐", label: "Okay" },
  { emoji: "😕", label: "Low" },
  { emoji: "😞", label: "Rough" },
];
