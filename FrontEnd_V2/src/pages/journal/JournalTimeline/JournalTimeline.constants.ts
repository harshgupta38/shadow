import DOMPurify from "dompurify";

import type { JournalEntryResponse, JournalMood } from "@/api/types";
import { MOODS } from "@/pages/journal/JournalPage.constants";

// Height of a collapsed entry (about four lines); anything taller gets a "Show more" button.
export const COLLAPSED_MAX_PX = 92;

export const MOOD_BY_KEY = Object.fromEntries(MOODS.map(m => [m.key, m])) as Record<JournalMood, (typeof MOODS)[number]>;

// ── Month helpers ("YYYY-MM") ────────────────────────────────────────────────

export function monthOf(iso: string): string {
    return iso.slice(0, 7);
}

export function shiftMonth(month: string, delta: number): string {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthRange(month: string): { start: string; end: string } {
    const [y, m] = month.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, "0")}` };
}

export function fmtMonthTitle(month: string): string {
    const [y, m] = month.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function dayParts(iso: string): { day: number; weekday: string } {
    const [y, m, d] = iso.split("-").map(Number);
    return { day: d, weekday: new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short" }) };
}

// ── Entries ──────────────────────────────────────────────────────────────────

function hasVisibleText(html: string): boolean {
    return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim() !== "";
}

/** A day that was opened and then cleared still has a row; the timeline only shows days with something written. */
export function hasContent(entry: JournalEntryResponse): boolean {
    return entry.mood !== null || hasVisibleText(entry.text);
}

export function newestFirst(list: JournalEntryResponse[]): JournalEntryResponse[] {
    return [...list].sort((a, b) => b.entry_date.localeCompare(a.entry_date));
}

/** Puts a saved entry into the list (replacing that day's older copy), newest day first. */
export function mergeEntry(list: JournalEntryResponse[], entry: JournalEntryResponse): JournalEntryResponse[] {
    const existing = list.find(e => e.entry_date === entry.entry_date);
    if (existing && existing.updated_at > entry.updated_at) return list;
    return newestFirst([...list.filter(e => e.entry_date !== entry.entry_date), entry]);
}

/** Entries hold the editor's HTML, so it is cleaned before it is shown. Links open in a new tab. */
export function sanitizeEntryHtml(html: string): string {
    const fragment = DOMPurify.sanitize(html, { RETURN_DOM_FRAGMENT: true });
    const box = document.createElement("div");
    box.appendChild(fragment);
    box.querySelectorAll("a").forEach(a => {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
    });
    return box.innerHTML;
}
