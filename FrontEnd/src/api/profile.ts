import { http } from "./client";
import type {
  AccountDataExport,
  AccountOverview,
  AIProfile,
  AIProfileUpdate,
  BasicProfile,
  BasicProfileUpdate,
  ChangePasswordRequest,
  ChatHistoryClearResult,
  DeleteAccountRequest,
  EmailVerificationDispatch,
  MemoryCenterEntry,
  MemoryEntry,
  MemoryEntryCreate,
  MemoryRefineRequest,
  MemoryRefineResponse,
  MemoryEntryUpdate,
  ProfileUpdate,
  User,
} from "./types";

export const profileApi = {
  // Legacy profile endpoints (kept for compatibility)
  async get(): Promise<User> {
    return http.get<User>("/profile");
  },
  async update(data: ProfileUpdate): Promise<User> {
    return http.put<User>("/profile", data);
  },

  // SCRUM-17 profile domain
  async basic(): Promise<BasicProfile> {
    return http.get<BasicProfile>("/profile/basic");
  },
  async updateBasic(data: BasicProfileUpdate): Promise<BasicProfile> {
    return http.put<BasicProfile>("/profile/basic", data);
  },
  async ai(): Promise<AIProfile> {
    return http.get<AIProfile>("/profile/ai");
  },
  async updateAi(data: AIProfileUpdate): Promise<AIProfile> {
    return http.put<AIProfile>("/profile/ai", data);
  },
  async account(): Promise<AccountOverview> {
    return http.get<AccountOverview>("/profile/account");
  },
  async requestEmailVerification(): Promise<EmailVerificationDispatch> {
    return http.post<EmailVerificationDispatch>("/auth/request-email-verification");
  },
  async changePassword(data: ChangePasswordRequest): Promise<{ detail: string }> {
    return http.post<{ detail: string }>("/profile/change-password", data);
  },
  async clearChatHistory(): Promise<ChatHistoryClearResult> {
    return http.post<ChatHistoryClearResult>("/profile/clear-chat-history");
  },
  async exportAccountData(): Promise<AccountDataExport> {
    return http.get<AccountDataExport>("/profile/export");
  },
  async deleteAccount(data: DeleteAccountRequest): Promise<{ detail: string }> {
    await http.del("/profile/account", data);
    return { detail: "Account deleted" };
  },
  async memoryCenter(): Promise<MemoryCenterEntry[]> {
    return http.get<MemoryCenterEntry[]>("/profile/memory-center");
  },

  async memories(): Promise<MemoryEntry[]> {
    return http.get<MemoryEntry[]>("/profile/memories");
  },
  async addMemory(data: MemoryEntryCreate): Promise<MemoryEntry> {
    return http.post<MemoryEntry>("/profile/memories", data);
  },
  async refineMemoryText(data: MemoryRefineRequest): Promise<MemoryRefineResponse> {
    return http.post<MemoryRefineResponse>("/profile/memories/refine", data);
  },
  async updateMemory(id: number, data: MemoryEntryUpdate): Promise<MemoryEntry> {
    return http.put<MemoryEntry>(`/profile/memories/${id}`, data);
  },
  async deleteMemory(id: number): Promise<void> {
    return http.del(`/profile/memories/${id}`);
  },
};
