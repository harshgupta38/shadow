import { parseServerDate } from "@/services/date.service";

const IST_TIMEZONE = "Asia/Kolkata";

// Reads a UTC instant's wall-clock date/time as it appears in IST, regardless of
// the viewer's own local timezone (Date.getHours()/getDate() etc. always use the
// browser's local timezone, which is not necessarily IST).
function istParts(date: Date) {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: IST_TIMEZONE,
        hourCycle: "h23",
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).formatToParts(date);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return {
        year: get("year"),
        month: get("month"),
        day: get("day"),
        hour24: Number(get("hour")),
        minute: get("minute"),
    };
}

export function formatChatTime(createdAt: string): string {
    const date = parseServerDate(createdAt);
    if (Number.isNaN(date.getTime())) return createdAt;

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60_000);

    if (diffMin < 1) return "Just now";
    if (diffMin === 1) return "1 min ago";
    if (diffMin < 60) return `${diffMin}min ago`;

    const msgIst = istParts(date);
    const nowIst = istParts(now);

    const period = msgIst.hour24 >= 12 ? "pm" : "am";
    const hour12 = msgIst.hour24 % 12 || 12;
    const timePart = `${String(hour12).padStart(2, "0")}:${msgIst.minute} ${period}`;

    const isSameDate = msgIst.year === nowIst.year && msgIst.month === nowIst.month && msgIst.day === nowIst.day;
    if (isSameDate) return timePart;

    return `${msgIst.day}-${msgIst.month}-${msgIst.year} ${timePart}`;
}
