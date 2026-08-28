import type { HabitCreateRequest, HabitDataResponse, HabitPreferredTime, HabitPriority, HabitType } from "@/api";
import { todayIso } from "@/services/date.service";

export type HabitWizardStepKey = "defineHabit" | "configurePlanning" | "habitTimeline" | "additionalDetails";

export type HabitWizardAnswers = {
    // Step 1: Define Habit
    title: string;
    plannerType: HabitType; // "simple" | "metric"

    // Step 2: Configure Planning
    plannerTarget: string; // metric only → target_value per session
    valueUnit: string; // metric only → target_unit
    priority: HabitPriority;
    frequencies: string[];
    weeklyCount: number;
    monthlyCount: number;
    specificDays: number[];
    dayFallback: boolean;

    // Step 3: Habit Timeline
    setStartDate: "yes" | "no";
    startDate: string; // YYYY-MM-DD
    setEndDate: boolean;
    endDate: string; // YYYY-MM-DD

    // Step 4: Additional Details
    preferredTime: HabitPreferredTime;
    specificTime: string;
    durationMinutes: string;
    note: string;
    goalId: string; // "" means null
};

export type HabitWizardStep = {
    key: HabitWizardStepKey;
    title: string;
    header: string | null;
    subtitle: string | null;
};

export const STEPS: HabitWizardStep[] = [
    {
        key: "defineHabit",
        title: "Define Habit",
        header: "What is the habit you want to build?",
        subtitle: null,
    },
    {
        key: "configurePlanning",
        title: "Plan & Schedule",
        header: "How should this habit be planned?",
        subtitle: "Choose how you want to track your habit and set your preferences.",
    },
    {
        key: "habitTimeline",
        title: "Habit Timeline",
        header: "Set your habit's active period",
        subtitle: "Choose the dates during which the daily planner should include this habit.",
    },
    {
        key: "additionalDetails",
        title: "Additional Details",
        header: "Set preferences",
        subtitle: "Add optional details to help the daily planner fit this habit into your day.",
    },
];


export function makeEmptyAnswers(): HabitWizardAnswers {
    return {
        title: "",
        plannerType: "simple",
        plannerTarget: "",
        valueUnit: "",
        priority: "medium",
        frequencies: [],
        weeklyCount: 1,
        monthlyCount: 1,
        specificDays: [],
        dayFallback: false,
        setStartDate: "no",
        startDate: todayIso(),
        setEndDate: false,
        endDate: "",
        preferredTime: "flexible",
        specificTime: "",
        durationMinutes: "",
        note: "",
        goalId: "",
    };
}

export const FREQUENCY_OPTIONS = [
    { value: "sunday",          label: "Sunday" },
    { value: "monday",          label: "Monday" },
    { value: "tuesday",         label: "Tuesday" },
    { value: "wednesday",       label: "Wednesday" },
    { value: "thursday",        label: "Thursday" },
    { value: "friday",          label: "Friday" },
    { value: "saturday",        label: "Saturday" },
    { value: "daily",           label: "Daily" },
    { value: "weekly",          label: "Weekly" },
    { value: "monthly",         label: "Monthly" },
    { value: "weekdays",        label: "Weekdays" },
    { value: "weekends",        label: "Weekends" },
    { value: "first_of_month",  label: "First of month" },
    { value: "end_of_month",    label: "End of month" },
    { value: "specific_day",    label: "Specific day" },
];

export const FREQ_DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
export const FREQ_PERIODS = ["daily", "weekly", "monthly", "weekdays", "weekends", "first_of_month", "end_of_month"] as const;

export const PRIORITY_OPTIONS: { value: HabitPriority; label: string }[] = [
    { value: "highest", label: "Highest: non-negotiable" },
    { value: "high",    label: "High: do it today" },
    { value: "medium",  label: "Medium: fits in the week" },
    { value: "low",     label: "Low: when I get to it" },
    { value: "lowest",  label: "Lowest: nice to have" },
];

export const PREFERRED_TIME_OPTIONS = [
    { value: "flexible",  label: "Flexible (any time of day)" },
    { value: "morning",   label: "Morning (before 12 pm)" },
    { value: "afternoon", label: "Afternoon (12 pm – 5 pm)" },
    { value: "evening",   label: "Evening (5 pm – 9 pm)" },
    { value: "night",     label: "Night (after 9 pm)" },
    { value: "custom",    label: "Specific time…" },
];

export const MINUTES = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"] as const;

export const HABIT_LOADER_STEPS = [
    "Loading habit details",
    "Preparing wizard",
    "Almost there",
];

// ── Field error types ──────────────────────────────────────────────────────────

export type HabitFieldErrorKey =
    | "title"
    | "plannerTarget"
    | "valueUnit"
    | "frequencies"
    | "startDate"
    | "endDate"
    | "specificTime";

export type HabitFieldErrors = Partial<Record<HabitFieldErrorKey, string>>;

// ── Initialization helpers ─────────────────────────────────────────────────────

export function answersFromHabit(habit: HabitDataResponse): HabitWizardAnswers {
    return {
        title: habit.title,
        plannerType: habit.planner_type,
        plannerTarget: habit.planner_target !== null ? String(habit.planner_target) : "",
        valueUnit: habit.value_unit ?? "",
        priority: habit.priority,
        frequencies: habit.frequencies ?? [],
        weeklyCount: habit.weekly_count ?? 1,
        monthlyCount: habit.monthly_count ?? 1,
        specificDays: habit.specific_days ?? [],
        dayFallback: habit.day_fallback,
        setStartDate: habit.start_date ? "yes" : "no",
        startDate: habit.start_date ?? new Date().toISOString().slice(0, 10),
        setEndDate: habit.end_date !== null,
        endDate: habit.end_date ?? "",
        preferredTime: habit.preferred_time ?? "flexible",
        specificTime: habit.specific_time ?? "",
        durationMinutes: habit.duration_minutes !== null ? String(habit.duration_minutes) : "",
        note: habit.note ?? "",
        goalId: habit.goal?.id != null ? String(habit.goal.id) : "",
    };
}

export function answersFromDraft(draft: Partial<HabitCreateRequest>): HabitWizardAnswers {
    const base = makeEmptyAnswers();
    return {
        ...base,
        title: draft.title ?? "",
        plannerType: draft.planner_type ?? "simple",
        plannerTarget: draft.planner_target != null ? String(draft.planner_target) : "",
        valueUnit: draft.value_unit ?? "",
        priority: draft.priority ?? "medium",
        frequencies: draft.frequencies ?? [],
        weeklyCount: draft.weekly_count ?? 1,
        monthlyCount: draft.monthly_count ?? 1,
        specificDays: draft.specific_days ?? [],
        dayFallback: draft.day_fallback ?? false,
        setStartDate: draft.start_date ? "yes" : "no",
        startDate: draft.start_date ?? base.startDate,
        setEndDate: draft.end_date !== null && draft.end_date !== undefined,
        endDate: draft.end_date ?? "",
        preferredTime: draft.preferred_time ?? "flexible",
        specificTime: draft.specific_time ?? "",
        durationMinutes: draft.duration_minutes != null ? String(draft.duration_minutes) : "",
        note: draft.note ?? "",
    };
}

// ── Error mapping ──────────────────────────────────────────────────────────────

export function mapApiFieldErrors(raw: Partial<Record<string, string>>): HabitFieldErrors {
    const mapped: HabitFieldErrors = {};
    const aliases: Record<HabitFieldErrorKey, string[]> = {
        title:         ["title"],
        plannerTarget: ["planner_target"],
        valueUnit:     ["value_unit"],
        frequencies:   ["frequencies"],
        startDate:     ["start_date"],
        endDate:       ["end_date"],
        specificTime:  ["specific_time"],
    };
    for (const key of Object.keys(aliases) as HabitFieldErrorKey[]) {
        const match = aliases[key].find((alias) => {
            const msg = raw[alias];
            return typeof msg === "string" && msg.trim().length > 0;
        });
        if (match) mapped[key] = String(raw[match]);
    }
    return mapped;
}

export function getStepBannerError(stepKey: HabitWizardStepKey, errs: HabitFieldErrors): string | null {
    if (stepKey === "defineHabit")       return errs.title ?? null;
    if (stepKey === "configurePlanning") return errs.plannerTarget ?? errs.valueUnit ?? errs.frequencies ?? null;
    if (stepKey === "habitTimeline")     return errs.startDate ?? errs.endDate ?? null;
    if (stepKey === "additionalDetails") return errs.specificTime ?? null;
    return null;
}

// ── Per-step validation ────────────────────────────────────────────────────────

export function getStepValidationErrors(stepKey: HabitWizardStepKey, answers: HabitWizardAnswers): HabitFieldErrors {
    const errs: HabitFieldErrors = {};

    if (stepKey === "defineHabit") {
        if (!answers.title.trim()) errs.title = "Please provide a title.";
        return errs;
    }

    if (stepKey === "configurePlanning") {
        if (answers.frequencies.length === 0) errs.frequencies = "Please select at least one frequency.";
        if (answers.plannerType === "metric") {
            if (parseOptionalPositiveInt(answers.plannerTarget) === null) errs.plannerTarget = "Target must be a whole number greater than 0.";
            if (!answers.valueUnit.trim()) errs.valueUnit = "Value unit is required for metric habits.";
        }
        return errs;
    }

    if (stepKey === "habitTimeline") {
        if (answers.setStartDate === "yes") {
            if (!answers.startDate) errs.startDate = "Please set a start date.";
            if (answers.setEndDate && !answers.endDate) errs.endDate = "Please set an end date.";
            if (answers.setEndDate && answers.endDate && answers.startDate && answers.endDate < answers.startDate) {
                errs.endDate = "End date must be on or after the start date.";
            }
        }
        return errs;
    }

    return errs;
}

// ── Parsing helpers ────────────────────────────────────────────────────────────

export function parseOptionalNumber(raw: string): number | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
}

export function parseRequiredPositive(raw: string): number | null {
    const parsed = parseOptionalNumber(raw);
    return parsed !== null && parsed > 0 ? parsed : null;
}

export function parseOptionalPositiveInt(raw: string): number | null {
    const parsed = parseOptionalNumber(raw);
    return parsed !== null && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function buildTime(h: string, m: string, a: string): string {
    let hour = parseInt(h, 10);
    if (a === "PM" && hour !== 12) hour += 12;
    if (a === "AM" && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${m}`;
}

export function parseTime(t: string): { h: string; m: string; a: string } {
    if (!t) return { h: "8", m: "00", a: "AM" };
    const [hh, mm] = t.split(":");
    const h24 = parseInt(hh, 10);
    return {
        h: String(h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24),
        m: mm ?? "00",
        a: h24 < 12 ? "AM" : "PM",
    };
}

export function computeDisabledFreqs(freqs: string[], hasSpecificDay: boolean): Set<string> {
    const d = new Set<string>();

    if (freqs.includes("daily")) {
        [...FREQ_DAYS, ...FREQ_PERIODS, "specific_day"].filter((v) => v !== "daily").forEach((v) => d.add(v));
        return d;
    }

    const GROUP_A = ["weekly", "monthly", "weekdays", "weekends"];
    const hasGroupA = freqs.some((f) => GROUP_A.includes(f));

    if (hasGroupA || hasSpecificDay) {
        (FREQ_PERIODS as readonly string[]).forEach((v) => { if (!freqs.includes(v)) d.add(v); });
        FREQ_DAYS.forEach((v) => d.add(v));
    }

    if (freqs.includes("first_of_month")) {
        GROUP_A.forEach((v) => d.add(v));
        FREQ_DAYS.forEach((v) => d.add(v));
        d.add("specific_day");
    }

    if (freqs.includes("end_of_month")) {
        GROUP_A.forEach((v) => d.add(v));
        FREQ_DAYS.forEach((v) => d.add(v));
        d.add("specific_day");
    }

    if (freqs.includes("weekdays")) ["monday", "tuesday", "wednesday", "thursday", "friday"].forEach((v) => d.add(v));
    if (freqs.includes("weekends")) ["saturday", "sunday"].forEach((v) => d.add(v));

    return d;
}
