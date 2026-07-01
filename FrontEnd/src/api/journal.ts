import { http } from "./client";
import type { JournalCreate, JournalEntry, JournalUpdate } from "./types";

export const journalApi = {
  async list(): Promise<JournalEntry[]> {
    return http.get<JournalEntry[]>("/journal");
  },
  async create(data: JournalCreate): Promise<JournalEntry> {
    return http.post<JournalEntry>("/journal", data);
  },
  async update(id: number, data: JournalUpdate): Promise<JournalEntry> {
    return http.put<JournalEntry>(`/journal/${id}`, data);
  },
  async remove(id: number): Promise<void> {
    return http.del(`/journal/${id}`);
  },
};
