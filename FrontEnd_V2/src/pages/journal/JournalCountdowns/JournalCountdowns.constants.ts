import type { CountdownColor, CountdownResponse } from "@/api/types";

export const COUNTDOWN_COLORS: { key: CountdownColor; label: string; css: string }[] = [
    { key: "brand",   label: "Indigo", css: "var(--jv-brand-1)" },
    { key: "info",    label: "Sky",    css: "var(--jv-info)" },
    { key: "success", label: "Green",  css: "var(--jv-success)" },
    { key: "warn",    label: "Amber",  css: "var(--jv-warn)" },
    { key: "violet",  label: "Violet", css: "var(--jv-violet)" },
];

export const COUNTDOWN_EMOJIS = ["🎯", "✈️", "🏖️", "🏔️", "🎓", "💍", "🎂", "🎉", "🏠", "💼", "📚", "🏃", "🚗", "🎵", "⚽", "❤️"];

export const DEFAULT_EMOJI = COUNTDOWN_EMOJIS[0];

export const MAX_ACTIVE_COUNTDOWNS = 10;

export function colorCss(key: CountdownColor): string {
    return COUNTDOWN_COLORS.find(c => c.key === key)?.css ?? COUNTDOWN_COLORS[0].css;
}

/** The big number on a card and the words under it. */
export function daysDisplay(daysLeft: number): { value: string; label: string } {
    if (daysLeft === 0) return { value: "Today", label: "is the day" };
    if (daysLeft === 1) return { value: "1", label: "day to go" };
    if (daysLeft > 1) return { value: String(daysLeft), label: "days to go" };
    const ago = -daysLeft;
    return { value: String(ago), label: ago === 1 ? "day ago" : "days ago" };
}

/** What the ring on a card shows: the days as its big text, and a short word under it. */
export function ringDisplay(daysLeft: number): { value: string; caption: string } {
    if (daysLeft === 0) return { value: "Today", caption: "" };
    if (daysLeft === 1) return { value: "1", caption: "day" };
    if (daysLeft > 1) return { value: String(daysLeft), caption: "days" };
    return { value: String(-daysLeft), caption: "ago" };
}

/** Which day of the count this is, as "Day 265 of 365". Null once the date has come. */
export function dayOfCount(countdown: CountdownResponse): string | null {
    if (countdown.days_left <= 0) return null;
    return `Day ${countdown.total_days - countdown.days_left} of ${countdown.total_days}`;
}

export function isOverdue(countdown: CountdownResponse): boolean {
    return countdown.status === "active" && countdown.days_left < 0;
}

// ── Dates in the form ────────────────────────────────────────────────────────

/** The quick picks under the date field. */
export const QUICK_TARGETS = [
    { label: "1 month", months: 1 },
    { label: "3 months", months: 3 },
    { label: "6 months", months: 6 },
    { label: "1 year", months: 12 },
];

function parts(iso: string): { y: number; m: number; d: number } {
    const [y, m, d] = iso.split("-").map(Number);
    return { y, m, d };
}

function isoOf(year: number, monthIndex: number, day: number): string {
    return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Whole days from one "YYYY-MM-DD" to another (negative when the second is earlier). */
export function daysBetween(fromIso: string, toIso: string): number {
    const a = parts(fromIso);
    const b = parts(toIso);
    return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
}

/** The same day some months on. The 31st plus a month is the last day of the shorter month, not the start of the next. */
export function addMonths(iso: string, months: number): string {
    const { y, m, d } = parts(iso);
    const first = new Date(Date.UTC(y, m - 1 + months, 1));
    const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    return isoOf(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, lastDay));
}

/** What the form's preview shows, worked out the way the server does: time from the start day to the target. */
export function previewTiming(startIso: string, targetIso: string, todayIso: string): { daysLeft: number; progress: number } {
    const daysLeft = daysBetween(todayIso, targetIso);
    if (daysLeft <= 0) return { daysLeft, progress: 100 };
    const total = Math.max(daysBetween(startIso, targetIso), 1);
    const elapsed = daysBetween(startIso, todayIso);
    return { daysLeft, progress: Math.max(0, Math.min(Math.round((elapsed / total) * 100), 99)) };
}
