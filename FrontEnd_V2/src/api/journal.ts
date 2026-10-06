import { ENDPOINTS } from "@/constant/shadow-endpoints";
import { http } from "@/api/client";
import type { JournalEntryResponse, JournalEntryUpsertRequest } from "@/api/types";

export const journalApi = {
    async getMonthEntries(year: number, month: number): Promise<JournalEntryResponse[]> {
        return http.get<JournalEntryResponse[]>(
            `${ENDPOINTS.JOURNAL.PREFIX}${ENDPOINTS.JOURNAL.LIST}?year=${year}&month=${month}`,
        );
    },

    async upsertEntry(date: string, data: JournalEntryUpsertRequest): Promise<JournalEntryResponse> {
        return http.post<JournalEntryResponse>(
            `${ENDPOINTS.JOURNAL.PREFIX}${ENDPOINTS.JOURNAL.ENTRY(date)}`,
            data,
        );
    },

    async deleteEntry(date: string): Promise<void> {
        return http.delete<void>(`${ENDPOINTS.JOURNAL.PREFIX}${ENDPOINTS.JOURNAL.ENTRY(date)}`);
    },
};
