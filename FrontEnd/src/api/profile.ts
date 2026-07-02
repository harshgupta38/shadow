import { http } from "./client";
import type {
  MemoryEntry,
  MemoryEntryCreate,
  ProfileUpdate,
  User,
} from "./types";

export const profileApi = {
  async get(): Promise<User> {
    return http.get<User>("/profile");
  },
  async update(data: ProfileUpdate): Promise<User> {
    return http.put<User>("/profile", data);
  },
  async memories(): Promise<MemoryEntry[]> {
    return http.get<MemoryEntry[]>("/profile/memories");
  },
  async addMemory(data: MemoryEntryCreate): Promise<MemoryEntry> {
    return http.post<MemoryEntry>("/profile/memories", data);
  },
};
