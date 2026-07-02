import { http } from "./client";
import type {
  ChatMessage,
  ChatSendResponse,
  ChatSession,
  ChatSessionCreate,
} from "./types";

export const chatApi = {
  async sessions(): Promise<ChatSession[]> {
    return http.get<ChatSession[]>("/chat/sessions");
  },
  async createSession(data: ChatSessionCreate): Promise<ChatSession> {
    return http.post<ChatSession>("/chat/sessions", data);
  },
  async messages(sessionId: number): Promise<ChatMessage[]> {
    return http.get<ChatMessage[]>(`/chat/sessions/${sessionId}/messages`);
  },
  async send(sessionId: number, content: string): Promise<ChatSendResponse> {
    return http.post<ChatSendResponse>(`/chat/sessions/${sessionId}/messages`, {
      content,
    });
  },
  async clearHistory(): Promise<void> {
    return http.del("/chat/history");
  },
};
