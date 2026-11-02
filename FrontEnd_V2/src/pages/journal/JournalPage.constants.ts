import type { JournalMood, WeekStartsOn } from "@/api/types";

interface MoodDef {
    key: JournalMood;
    label: string;
    emoji: string;
    color: string;
}

export const MOODS: MoodDef[] = [
    { key: "great", label: "Great", emoji: "😄", color: "#22c55e" },
    { key: "good",  label: "Good",  emoji: "🙂", color: "#38bdf8" },
    { key: "okay",  label: "Okay",  emoji: "😐", color: "#fbbf24" },
    { key: "tough", label: "Tough", emoji: "😕", color: "#f97316" },
    { key: "rough", label: "Rough", emoji: "😣", color: "#f43f5e" },
];

export function fmtDisplayDate(iso: string): string {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric",
    });
}

function startOfWeek(iso: string, weekStartsOn: WeekStartsOn): Date {
    const [y, m, d] = iso.split("-").map(Number);
    const day = new Date(y, m - 1, d);
    day.setDate(day.getDate() - ((day.getDay() - (weekStartsOn === "monday" ? 1 : 0) + 7) % 7));
    return day;
}

/** The seven dates ("YYYY-MM-DD") of the week `offset` weeks away from the one containing `today`. */
export function computeWeekDates(today: string, offset: number, weekStartsOn: WeekStartsOn): string[] {
    const first = startOfWeek(today, weekStartsOn);
    first.setDate(first.getDate() + offset * 7);
    return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(first);
        d.setDate(first.getDate() + i);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    });
}

/** How many weeks before the current one `iso` falls (0 = this week), the unit the week strip navigates in. */
export function weekOffsetOf(today: string, iso: string, weekStartsOn: WeekStartsOn): number {
    const diff = startOfWeek(iso, weekStartsOn).getTime() - startOfWeek(today, weekStartsOn).getTime();
    return Math.round(diff / (7 * 24 * 60 * 60 * 1000));
}
