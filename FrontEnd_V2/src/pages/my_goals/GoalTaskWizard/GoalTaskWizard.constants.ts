import type { TaskPriority, TaskPreferredTime, TaskType } from "@/api";

export type TaskWizardStepKey = "defineTask" | "configureProgress" | "configurePlanning" | "additionalDetails";

export type TaskWizardAnswers = {
    title: string;
    note: string;
    taskType: TaskType;

    // Numeric progress fields — ignored for Binary tasks.
    targetValue: string;
    valueUnit: string;

    // Planning configuration
    planningEnabled: boolean;
    plannerTarget: string; // Numeric only; always empty/ignored for Binary tasks

    // Scheduling fields — same concepts as Habit.
    frequencies: string[];
    priority: TaskPriority;
    preferredTime: TaskPreferredTime;
    specificTime: string;
    durationMinutes: string;

    weeklyCount: number;
    monthlyCount: number;
    specificDays: number[];
    dayFallback: boolean;
};

export type TaskWizardStep = {
    key: TaskWizardStepKey;
    title: string;
    header: string | null;
    subtitle: string | null;
};

export const STEPS: TaskWizardStep[] = [
    {
        key: "defineTask",
        title: "Define Task",
        header: "What task will move this milestone forward?",
        subtitle: null,
    },
    {
        key: "configureProgress",
        title: "Configure Progress",
        header: "How will progress be measured?",
        subtitle: "Set the target and define how Shadow should track your progress.",
    },
    {
        key: "configurePlanning",
        title: "Configure Planning",
        header: "How should this task be planned?",
        subtitle: "Choose whether this task should appear in your daily plan and how much to plan.",
    },
    {
        key: "additionalDetails",
        title: "Additional Details",
        header: null,
        subtitle: null,
    },
];

export const EMPTY_ANSWERS: TaskWizardAnswers = {
    title: "",
    note: "",
    taskType: "Binary",
    targetValue: "",
    valueUnit: "",
    planningEnabled: false,
    plannerTarget: "",
    frequencies: [],
    priority: "medium",
    preferredTime: "flexible",
    specificTime: "",
    durationMinutes: "",

    weeklyCount: 1,
    monthlyCount: 1,
    specificDays: [],
    dayFallback: false,
};

export const FREQUENCY_OPTIONS = [
    { value: "sunday",        label: "Sunday" },
    { value: "monday",        label: "Monday" },
    { value: "tuesday",       label: "Tuesday" },
    { value: "wednesday",     label: "Wednesday" },
    { value: "thursday",      label: "Thursday" },
    { value: "friday",        label: "Friday" },
    { value: "saturday",      label: "Saturday" },
    { value: "daily",         label: "Daily" },
    { value: "weekly",        label: "Weekly" },
    { value: "monthly",       label: "Monthly" },
    { value: "weekdays",      label: "Weekdays" },
    { value: "weekends",      label: "Weekends" },
    { value: "first_of_month", label: "First of month" },
    { value: "end_of_month",  label: "End of month" },
    { value: "specific_day",  label: "Specific day" },
];

export const FREQ_DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
export const FREQ_PERIODS = ["daily", "weekly", "monthly", "weekdays", "weekends", "first_of_month", "end_of_month"] as const;

export const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
    { value: "highest", label: "Highest: non-negotiable" },
    { value: "high",    label: "High: do it today" },
    { value: "medium",  label: "Medium: fits in the week" },
    { value: "low",     label: "Low: when I get to it" },
    { value: "lowest",  label: "Lowest: nice to have" },
];

export const PREFERRED_TIME_OPTIONS: { value: TaskPreferredTime; label: string }[] = [
    { value: "flexible",  label: "Flexible (any time of day)" },
    { value: "morning",   label: "Morning (before 12 pm)" },
    { value: "afternoon", label: "Afternoon (12 pm – 5 pm)" },
    { value: "evening",   label: "Evening (5 pm – 9 pm)" },
    { value: "night",     label: "Night (after 9 pm)" },
    { value: "custom",    label: "Specific time…" },
];

export const MINUTES = ["00","05","10","15","20","25","30","35","40","45","50","55"] as const;

export const GOAL_LOADER_STEPS = [
    "Loading your goal details",
    "Loading milestone context",
    "Preparing task setup",
    "Almost there",
];

