import { ENDPOINTS } from "@/constant/shadow-endpoints";
import { http } from "@/api/client";
import type { JournalEntryResponse, JournalEntryUpsertRequest } from "@/api/types";

export const journalApi = {
    async getEntries(start: string, end: string): Promise<JournalEntryResponse[]> {
        return http.get<JournalEntryResponse[]>(
            `${ENDPOINTS.JOURNAL.PREFIX}${ENDPOINTS.JOURNAL.LIST}?start=${start}&end=${end}`,
        );
    },

    async upsertEntry(date: string, data: JournalEntryUpsertRequest): Promise<JournalEntryResponse> {
        return http.post<JournalEntryResponse>(
            `${ENDPOINTS.JOURNAL.PREFIX}${ENDPOINTS.JOURNAL.ENTRY(date)}`,
            data,
        );
    },
};
