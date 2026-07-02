import { http } from "./client";
import type {
  MemoryEntry,
  MemoryEntryCreate,
  PasswordChange,
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
  async changePassword(data: PasswordChange): Promise<{ detail: string }> {
    return http.put<{ detail: string }>("/profile/password", data);
  },
  async deleteAccount(password: string): Promise<void> {
    return http.del("/profile", { password });
  },
  async memories(): Promise<MemoryEntry[]> {
    return http.get<MemoryEntry[]>("/profile/memories");
  },
  async addMemory(data: MemoryEntryCreate): Promise<MemoryEntry> {
    return http.post<MemoryEntry>("/profile/memories", data);
  },
};
