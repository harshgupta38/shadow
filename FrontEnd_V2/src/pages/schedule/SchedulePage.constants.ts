import type { ScheduledTaskPreferredTime, ScheduledTaskPriority, ScheduledTaskStatus } from "@/api/types";

// ── Calendar display ─────────────────────────────────────────────────────────

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

// ── Filter types & constants ─────────────────────────────────────────────────

export interface ScheduleFilterState {
    priority: ScheduledTaskPriority[];
    preferredTime: ScheduledTaskPreferredTime[];
    status: ScheduledTaskStatus[];
}

export const DEFAULT_FILTERS: ScheduleFilterState = { priority: [], preferredTime: [], status: ["upcoming"] };

export const PRIORITY_FILTER_OPTIONS: Array<{ value: ScheduledTaskPriority; label: string }> = [
    { value: "highest", label: "Highest" },
    { value: "high",    label: "High"    },
    { value: "medium",  label: "Medium"  },
    { value: "low",     label: "Low"     },
    { value: "lowest",  label: "Lowest"  },
];

export const STATUS_FILTER_OPTIONS: Array<{ value: ScheduledTaskStatus; label: string }> = [
    { value: "upcoming",  label: "Upcoming"  },
    { value: "completed", label: "Completed" },
    { value: "snoozed",   label: "Snoozed"   },
    { value: "missed",    label: "Missed"    },
];

export const TIME_FILTER_OPTIONS: Array<{ value: ScheduledTaskPreferredTime; label: string }> = [
    { value: "flexible",  label: "Flexible"  },
    { value: "morning",   label: "Morning"   },
    { value: "afternoon", label: "Afternoon" },
    { value: "evening",   label: "Evening"   },
    { value: "night",     label: "Night"     },
    { value: "custom",    label: "Specific"  },
];

// ── Calendar helpers ─────────────────────────────────────────────────────────

export interface CalCell {
    iso: string;
    day: number;
    isCurrentMonth: boolean;
}

export function calIso(year: number, month: number, day: number): string {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function buildCalendarCells(year: number, month: number): CalCell[] {
    const firstDay = new Date(year, month, 1);
    const startDow = firstDay.getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const cells: CalCell[] = [];

    for (let i = 0; i < startDow; i++) {
        const d = new Date(year, month, i - startDow + 1);
        cells.push({ iso: calIso(d.getFullYear(), d.getMonth(), d.getDate()), day: d.getDate(), isCurrentMonth: false });
    }
    for (let d = 1; d <= totalDays; d++) {
        cells.push({ iso: calIso(year, month, d), day: d, isCurrentMonth: true });
    }
    const remainder = cells.length % 7;
    if (remainder > 0) {
        for (let i = 1; i <= 7 - remainder; i++) {
            const d = new Date(year, month + 1, i);
            cells.push({ iso: calIso(d.getFullYear(), d.getMonth(), d.getDate()), day: d.getDate(), isCurrentMonth: false });
        }
    }
    return cells;
}
