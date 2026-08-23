import type { FilterState, HabitCreateRequest, HabitPriority } from "@/api";

export const SLIDE_OUT_DURATION_MS = 220;

export const FREQUENCY_OPTIONS = [
    { value: "sunday", label: "Sunday" },
    { value: "monday", label: "Monday" },
    { value: "tuesday", label: "Tuesday" },
    { value: "wednesday", label: "Wednesday" },
    { value: "thursday", label: "Thursday" },
    { value: "friday", label: "Friday" },
    { value: "saturday", label: "Saturday" },

    { value: "daily", label: "Daily" },
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
    { value: "weekdays", label: "Weekdays" },
    { value: "weekends", label: "Weekends" },
    { value: "first_of_month", label: "First of month" },
    { value: "end_of_month", label: "End of month" },
    { value: "specific_day", label: "Specific day" },
];

export const PREFERRED_TIME_OPTIONS = [
    { value: "morning", label: "Morning (before 12 pm)" },
    { value: "afternoon", label: "Afternoon (12 pm – 5 pm)" },
    { value: "evening", label: "Evening (5 pm – 9 pm)" },
    { value: "night", label: "Night (after 9 pm)" },
    { value: "custom", label: "Specific time…" },
];

export const DEFAULT_FILTERS: FilterState = { status: ["active"], priority: [], frequency: [] };
export const EMPTY_FILTERS: FilterState = { status: [], priority: [], frequency: [] };

export const EMPTY_DRAFT: HabitCreateRequest = {
    name: "",
    motivation: null,
    frequencies: [],
    preferred_time: "flexible",
    specific_time: "",
    duration_minutes: null,
    start_date: null,
    end_date: null,
    priority: "medium",
    weekly_count: null,
    monthly_count: null,
    specific_days: null,
    day_fallback: false,
};


export const PRIORITY_OPTIONS: { value: HabitPriority; label: string }[] = [
    { value: "highest", label: "Highest: non-negotiable" },
    { value: "high",    label: "High: do it today" },
    { value: "medium",  label: "Medium: fits in the week" },
    { value: "low",     label: "Low: when I get to it" },
    { value: "lowest",  label: "Lowest: nice to have" },
];

export const FILTER_STATUS_OPTIONS: { value: string; label: string }[] = [
    { value: "active", label: "Active" },
    { value: "paused", label: "Paused" },
    { value: "archived", label: "Archived" },
];