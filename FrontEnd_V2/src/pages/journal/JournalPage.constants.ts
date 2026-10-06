import type { JournalMood } from "@/api/types";

export interface MoodDef {
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
