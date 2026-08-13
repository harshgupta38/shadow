import { ENDPOINTS } from "@/constant/shadow-endpoints";

import { http } from "@/api/client";
import {
    ChatMessagePage,
    ChatSendRequest,
    ChatSendResponse,
    ConversationCreateRequest,
    ConversationRead,
} from "@/api/types";

export const chatApi = {
    async createConversation(data: ConversationCreateRequest): Promise<ConversationRead> {
        return http.post<ConversationRead>(`${ENDPOINTS.CHAT.PREFIX}${ENDPOINTS.CHAT.CONVERSATIONS}`, data);
    },

    async getConversations(): Promise<ConversationRead[]> {
        return http.get<ConversationRead[]>(`${ENDPOINTS.CHAT.PREFIX}${ENDPOINTS.CHAT.CONVERSATIONS}`);
    },

    async getConversation(conversationId: number): Promise<ConversationRead> {
        return http.get<ConversationRead>(`${ENDPOINTS.CHAT.PREFIX}${ENDPOINTS.CHAT.CONVERSATION_DETAIL(conversationId)}`);
    },

    async deleteConversation(conversationId: number): Promise<void> {
        return http.delete<void>(`${ENDPOINTS.CHAT.PREFIX}${ENDPOINTS.CHAT.CONVERSATION_DETAIL(conversationId)}`);
    },

    async getMessages(conversationId: number, limit = 20, beforeMessageId?: number): Promise<ChatMessagePage> {
        return http.get<ChatMessagePage>(`${ENDPOINTS.CHAT.PREFIX}${ENDPOINTS.CHAT.MESSAGES(conversationId)}`, {
            params: {
                limit,
                before_message_id: beforeMessageId,
            },
        });
    },

    async sendMessage(conversationId: number, data: ChatSendRequest): Promise<ChatSendResponse> {
        return http.post<ChatSendResponse>(`${ENDPOINTS.CHAT.PREFIX}${ENDPOINTS.CHAT.MESSAGES(conversationId)}`, data);
    },
};
