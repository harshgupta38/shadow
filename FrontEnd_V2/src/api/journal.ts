import { ENDPOINTS } from "@/constant/shadow-endpoints";
import { http } from "@/api/client";
import type { JournalEntryResponse, JournalEntryUpsertRequest } from "@/api/types";

/**
 * A backend from before countdowns sends no `countdown_ids`. The journal reads them everywhere, so a frontend that is deployed first
 * would crash the page: default them here. Safe to delete once every backend is on the countdowns version.
 */
export function withCountdownIds(entry: JournalEntryResponse): JournalEntryResponse {
    return { ...entry, countdown_ids: entry.countdown_ids ?? [] };
}

export const journalApi = {
    async getEntries(start: string, end: string): Promise<JournalEntryResponse[]> {
        const entries = await http.get<JournalEntryResponse[]>(
            `${ENDPOINTS.JOURNAL.PREFIX}${ENDPOINTS.JOURNAL.LIST}?start=${start}&end=${end}`,
        );
        return entries.map(withCountdownIds);
    },

    async upsertEntry(date: string, data: JournalEntryUpsertRequest): Promise<JournalEntryResponse> {
        return withCountdownIds(await http.post<JournalEntryResponse>(
            `${ENDPOINTS.JOURNAL.PREFIX}${ENDPOINTS.JOURNAL.ENTRY(date)}`,
            data,
        ));
    },
};
