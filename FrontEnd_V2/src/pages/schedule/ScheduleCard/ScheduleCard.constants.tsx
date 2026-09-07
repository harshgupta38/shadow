import { Clock, MoonFill, MoonStarsFill, SunFill } from "react-bootstrap-icons";

import type { ScheduledTaskPreferredTime, ScheduledTaskStatus } from "@/api/types";
import { formatDisplayDate, formatDisplayDateShort } from "@/services/date.service";

export { PRIORITY_COLOR, PRIORITY_LABEL } from "@/constant/priority";

export const STATUS_LABEL: Record<ScheduledTaskStatus, string> = {
    upcoming:  "Upcoming",
    completed: "Completed",
    snoozed:   "Snoozed",
    missed:    "Missed",
};

export const formatDateDisplay = formatDisplayDate;
export const formatDateDisplayYearly = formatDisplayDateShort;

const PREFERRED_TIME_LABEL: Partial<Record<ScheduledTaskPreferredTime, string>> = {
    morning:   "Morning",
    afternoon: "Afternoon",
    evening:   "Evening",
    night:     "Night",
};

export function formatTimeDisplay(
    preferredTime: ScheduledTaskPreferredTime,
    specificTime: string | null,
): string | null {
    if (preferredTime === "flexible") return null;
    if (preferredTime === "custom") {
        if (!specificTime) return null;
        const [hh, mm] = specificTime.split(":");
        const h24 = parseInt(hh, 10);
        const ampm = h24 < 12 ? "AM" : "PM";
        const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
        return `${h12}:${mm} ${ampm}`;
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
