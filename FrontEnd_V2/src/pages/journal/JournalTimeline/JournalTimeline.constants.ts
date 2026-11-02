import DOMPurify from "dompurify";

import type { JournalEntryResponse, JournalMood } from "@/api/types";
import { MOODS } from "@/pages/journal/JournalPage.constants";

// Height of a collapsed entry (about four lines); anything taller gets a "Show more" button.
export const COLLAPSED_MAX_PX = 92;

export const MOOD_BY_KEY = Object.fromEntries(MOODS.map(m => [m.key, m])) as Record<JournalMood, (typeof MOODS)[number]>;

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
