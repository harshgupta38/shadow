import type { FilterState, HabitCreateRequest } from "@/api";

export const SLIDE_OUT_DURATION_MS = 220;

export const FREQUENCY_OPTIONS = [
    { value: "sunday", label: "Sun" },
    { value: "monday", label: "Mon" },
    { value: "tuesday", label: "Tue" },
    { value: "wednesday", label: "Wed" },
    { value: "thursday", label: "Thu" },
    { value: "friday", label: "Fri" },
    { value: "saturday", label: "Sat" },

    { value: "daily", label: "Daily" },
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
    { value: "weekdays", label: "Weekdays" },
    { value: "weekends", label: "Weekends" },
    { value: "first_of_month", label: "First of month" },
    { value: "end_of_month", label: "End of month" },
];

export const PREFERRED_TIME_OPTIONS = [
    { value: "flexible", label: "Flexible (no preference)" },
    { value: "morning", label: "Morning (before noon)" },
    { value: "afternoon", label: "Afternoon (noon - 5 pm)" },
    { value: "evening", label: "Evening (after 5 pm)" },
    { value: "specific", label: "Specific time…" },
];

function todayIso(): string {
    return new Date().toISOString().slice(0, 10);
}

export const EMPTY_FILTERS: FilterState = { status: [], frequency: [] };

export const EMPTY_DRAFT: HabitCreateRequest = {
    name: "",
    motivation: null,
    frequencies: [],
    preferred_time: "flexible",
    specific_time: "",
    duration_minutes: null,
    start_date: todayIso(),
    end_date: null,
    is_ongoing: true,
};


export const FILTER_STATUS_OPTIONS = ["Active", "Paused", "Archived"];
// const PRIORITY_OPTIONS = ["Very Low", "Low", "Medium", "High", "Very High"];
// const GOAL_LINKAGE_OPTIONS = ["Not linked to goals"];
export const FILTER_FREQUENCY_OPTIONS = [...FREQUENCY_OPTIONS.map((f) => f.label)];