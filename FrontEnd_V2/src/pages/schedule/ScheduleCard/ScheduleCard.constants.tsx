import { Clock, MoonFill, MoonStarsFill, SunFill } from "react-bootstrap-icons";

import type { DateFormat, ScheduledTaskPreferredTime, ScheduledTaskStatus, TimeFormat } from "@/api/types";
import { formatDisplayDate, formatDisplayDateShort, formatTime } from "@/services/date.service";

export { PRIORITY_COLOR, PRIORITY_LABEL } from "@/constant/priority";

export const STATUS_LABEL: Record<ScheduledTaskStatus, string> = {
    upcoming:  "Upcoming",
    completed: "Completed",
    snoozed:   "Snoozed",
    missed:    "Missed",
};

export function formatDateDisplay(iso: string, format: DateFormat = "dd mmmm yyyy"): string {
    return formatDisplayDate(iso, format);
}
export function formatDateDisplayYearly(iso: string, format: DateFormat = "dd mmmm yyyy"): string {
    return formatDisplayDateShort(iso, format);
}

export function formatDateRange(startIso: string, endIso: string): string {
    const fmt = (iso: string) => {
        const dt = new Date(iso + "T00:00:00");
        const dd = String(dt.getDate()).padStart(2, "0");
        const mmm = dt.toLocaleString("en-US", { month: "short" });
        const yy = String(dt.getFullYear()).slice(2);
        return `${dd} ${mmm} ${yy}`;
    };
    return `${fmt(startIso)} – ${fmt(endIso)}`;
}

const PREFERRED_TIME_LABEL: Partial<Record<ScheduledTaskPreferredTime, string>> = {
    morning:   "Morning",
    afternoon: "Afternoon",
    evening:   "Evening",
    night:     "Night",
};

export function formatTimeDisplay(
    preferredTime: ScheduledTaskPreferredTime,
    specificTime: string | null,
    format: TimeFormat = "12h",
): string | null {
    if (preferredTime === "flexible") return null;
    if (preferredTime === "custom") {
        if (!specificTime) return null;
        return formatTime(specificTime, format);
    }
    return PREFERRED_TIME_LABEL[preferredTime] ?? null;
}

export function TimeIcon({ preferredTime }: { preferredTime: ScheduledTaskPreferredTime }) {
    if (preferredTime === "morning")   return <SunFill       size={11} className="sc-time-icon sc-time-icon--sun-am" />;
    if (preferredTime === "afternoon") return <SunFill       size={11} className="sc-time-icon sc-time-icon--sun-pm" />;
    if (preferredTime === "evening")   return <MoonFill      size={10} className="sc-time-icon sc-time-icon--moon"   />;
    if (preferredTime === "night")     return <MoonStarsFill size={10} className="sc-time-icon sc-time-icon--moon"   />;
    if (preferredTime === "custom")    return <Clock         size={11} className="sc-time-icon sc-time-icon--clock"  />;
    return null;
}
