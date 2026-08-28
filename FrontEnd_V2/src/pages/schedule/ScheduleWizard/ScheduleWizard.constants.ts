import type {
    ScheduledTaskDataResponse,
    ScheduledTaskPreferredTime,
    ScheduledTaskPriority,
    ScheduledTaskType,
} from "@/api";
import { todayIso } from "@/services/date.service";

export type ScheduleWizardStepKey = "defineTask" | "whenAndPriority" | "additionalDetails";

export type ScheduleWizardAnswers = {
    // Step 1: Define Task
    title: string;
    plannerType: ScheduledTaskType;

    // Step 2: When & Priority
    plannerTarget: string; // metric only
    valueUnit: string;     // metric only
    priority: ScheduledTaskPriority;
    scheduledDate: string; // YYYY-MM-DD
    preferredTime: ScheduledTaskPreferredTime;
    specificTime: string;  // "HH:MM" when preferredTime === "custom"

    // Step 3: Additional Details
    allowSnoozing: boolean;
    snoozeLimit: string;   // "" = null (infinite)
    durationMinutes: string;
    note: string;
};

export type ScheduleWizardStep = {
    key: ScheduleWizardStepKey;
    title: string;
    header: string | null;
    subtitle: string | null;
};

export const STEPS: ScheduleWizardStep[] = [
    {
        key: "defineTask",
        title: "Define Task",
        header: "What is the task you want to schedule?",
        subtitle: null,
    },
    {
        key: "whenAndPriority",
        title: "When & Priority",
        header: "When should this task happen?",
        subtitle: "Set the date, time preference, and importance of this task.",
    },
    {
        key: "additionalDetails",
        title: "Additional Details",
        header: "Finishing touches",
        subtitle: "Add optional details to help the planner fit this task into your day.",
    },
];


export function makeEmptyAnswers(): ScheduleWizardAnswers {
    return {
        title: "",
        plannerType: "simple",
        plannerTarget: "",
        valueUnit: "",
        priority: "medium",
        scheduledDate: todayIso(),
        preferredTime: "flexible",
        specificTime: "",
        allowSnoozing: false,
        snoozeLimit: "",
        durationMinutes: "",
        note: "",
    };
}

export function answersFromTask(task: ScheduledTaskDataResponse): ScheduleWizardAnswers {
    return {
        title: task.title,
        plannerType: task.planner_type,
        plannerTarget: task.planner_target !== null ? String(task.planner_target) : "",
        valueUnit: task.value_unit ?? "",
        priority: task.priority,
        scheduledDate: task.scheduled_date,
        preferredTime: task.preferred_time ?? "flexible",
        specificTime: task.specific_time ?? "",
        allowSnoozing: task.allow_snoozing,
        snoozeLimit: task.snooze_limit !== null ? String(task.snooze_limit) : "",
        durationMinutes: task.duration_minutes !== null ? String(task.duration_minutes) : "",
        note: task.note ?? "",
    };
}

export const PRIORITY_OPTIONS: { value: ScheduledTaskPriority; label: string }[] = [
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

export const SCHEDULE_LOADER_STEPS = [
    "Loading task details",
    "Preparing wizard",
    "Almost there",
];

// ── Field error types ──────────────────────────────────────────────────────────

export type ScheduleFieldErrorKey =
    | "title"
    | "plannerTarget"
    | "valueUnit"
    | "scheduledDate"
    | "specificTime"
    | "snoozeLimit";

export type ScheduleFieldErrors = Partial<Record<ScheduleFieldErrorKey, string>>;

// ── Error mapping ──────────────────────────────────────────────────────────────

export function mapApiFieldErrors(raw: Partial<Record<string, string>>): ScheduleFieldErrors {
    const mapped: ScheduleFieldErrors = {};
    const aliases: Record<ScheduleFieldErrorKey, string[]> = {
        title:         ["title"],
        plannerTarget: ["planner_target"],
        valueUnit:     ["value_unit"],
        scheduledDate: ["scheduled_date"],
        specificTime:  ["specific_time"],
        snoozeLimit:   ["snooze_limit"],
    };
    for (const key of Object.keys(aliases) as ScheduleFieldErrorKey[]) {
        const match = aliases[key].find((alias) => {
            const msg = raw[alias];
            return typeof msg === "string" && msg.trim().length > 0;
        });
        if (match) mapped[key] = String(raw[match]);
    }
    return mapped;
}

export function getStepBannerError(stepKey: ScheduleWizardStepKey, errs: ScheduleFieldErrors): string | null {
    if (stepKey === "defineTask")        return errs.title ?? null;
    if (stepKey === "whenAndPriority")   return errs.plannerTarget ?? errs.valueUnit ?? errs.scheduledDate ?? errs.specificTime ?? null;
    if (stepKey === "additionalDetails") return errs.snoozeLimit ?? null;
    return null;
}

// ── Per-step validation ────────────────────────────────────────────────────────

export function getStepValidationErrors(stepKey: ScheduleWizardStepKey, answers: ScheduleWizardAnswers): ScheduleFieldErrors {
    const errs: ScheduleFieldErrors = {};

    if (stepKey === "defineTask") {
        if (!answers.title.trim()) errs.title = "Please provide a title.";
        return errs;
    }

    if (stepKey === "whenAndPriority") {
        if (!answers.scheduledDate) errs.scheduledDate = "Please set a scheduled date.";
        if (answers.plannerType === "metric") {
            if (parseOptionalPositiveInt(answers.plannerTarget) === null) {
                errs.plannerTarget = "Target must be a whole number greater than 0.";
            }
            if (!answers.valueUnit.trim()) errs.valueUnit = "Value unit is required for metric tasks.";
        }
        return errs;
    }

    if (stepKey === "additionalDetails") {
        if (answers.allowSnoozing && answers.snoozeLimit !== "") {
            if (parseOptionalPositiveInt(answers.snoozeLimit) === null) {
                errs.snoozeLimit = "Snooze limit must be a whole number greater than 0.";
            }
        }
        return errs;
    }

    return errs;
}

// ── Parsing helpers ────────────────────────────────────────────────────────────

export function parseOptionalPositiveInt(raw: string): number | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
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
