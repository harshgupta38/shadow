export const IST_TIMEZONE = "Asia/Kolkata";

export function todayIso(): string {
    return new Date().toLocaleDateString("en-CA", { timeZone: IST_TIMEZONE });
}

/**
 * The backend stores timestamps in UTC and may serialize them without an explicit
 * offset. A naive string like "2026-09-09T10:00:00" would otherwise be parsed by
 * `new Date()` as browser-local time instead of UTC. Stamp a "Z" on before parsing
 * so every full timestamp from the backend is read as UTC, then converted to IST
 * wherever it's displayed or compared.
 */
export function parseServerDate(iso: string): Date {
    const normalized = iso.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(iso) ? iso : `${iso}Z`;
    return new Date(normalized);
}

export function todayDate(): Date {
    const [y, m, d] = todayIso().split("-").map(Number);
    return new Date(y, m - 1, d);
}

const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

/** "DD Month YYYY" from an ISO ("YYYY-MM-DD") date string. Returns the original
 * input unchanged if it isn't a valid date, instead of rendering "undefined"/"NaN". */
export function formatDisplayDate(iso: string): string {
    const [y, m, d] = iso.split("-").map(Number);
    if (!y || !m || !d || m < 1 || m > 12) return iso;
    return `${String(d).padStart(2, "0")} ${MONTH_NAMES[m - 1]} ${y}`;
}

/** "DD Month" (no year) from an ISO date string — for yearly-repeating dates. Returns
 * the original input unchanged if it isn't a valid date. */
export function formatDisplayDateShort(iso: string): string {
    const [, m, d] = iso.split("-").map(Number);
    if (!m || !d || m < 1 || m > 12) return iso;
    return `${String(d).padStart(2, "0")} ${MONTH_NAMES[m - 1]}`;
}

/** "1h 30m" / "45m" / "2h" style duration from a minute count. */
export function formatDuration(minutes: number): string {
    if (minutes === 0) return "0m";
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}m`;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function relativeTime(iso: string): string {
    const diffMs = Date.now() - parseServerDate(iso).getTime();
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    const wks = Math.floor(days / 7);
    if (wks < 5) return `${wks}w ago`;
    return parseServerDate(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: IST_TIMEZONE });
}

export function notifDateLabel(iso: string): string {
    const dateStr = parseServerDate(iso).toLocaleDateString("en-CA", { timeZone: IST_TIMEZONE });
    const today = todayIso();
    if (dateStr === today) return "Today";
    // Anchor at noon UTC (safely mid-day in IST either side of the date change) rather
    // than going through a local Date + timezone-formatting round trip — the latter can
    // shift by a day for a viewer far enough from IST (e.g. todayDate() is anchored to
    // the viewer's own local midnight, not IST midnight).
    const [y, m, d] = today.split("-").map(Number);
    const yesterdayStr = new Date(Date.UTC(y, m - 1, d - 1, 12)).toLocaleDateString("en-CA", { timeZone: IST_TIMEZONE });
    if (dateStr === yesterdayStr) return "Yesterday";
    return parseServerDate(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric", timeZone: IST_TIMEZONE });
}

export function notifTime(iso: string): string {
    const date = parseServerDate(iso);
    const diffMs = Date.now() - date.getTime();
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 12) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
    const time = date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: IST_TIMEZONE });
    const day = date.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric", timeZone: IST_TIMEZONE });
    return `${time}, ${day}`;
}
