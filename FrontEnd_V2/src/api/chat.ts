import { ENDPOINTS } from "@/constant/shadow-endpoints";

import { http } from "@/api/client";
import { ConversationData, MessageData, LLMSendMessageResponse, SendMessageRequest } from "@/api/types";

export const chatApi = {
    async getConversations(): Promise<ConversationData[]> {
        return http.get<ConversationData[]>(`${ENDPOINTS.CHAT.PREFIX}${ENDPOINTS.CHAT.CONVERSATIONS}`);
    },

    async getMessages(conversationId: number): Promise<MessageData[]> {
        return http.get<MessageData[]>(`${ENDPOINTS.CHAT.PREFIX}${ENDPOINTS.CHAT.MESSAGES(conversationId)}`);
    },

    async deleteConversation(conversationId: number): Promise<void> {
        return http.delete<void>(`${ENDPOINTS.CHAT.PREFIX}${ENDPOINTS.CHAT.CONVERSATION_DETAIL(conversationId)}`);
    },

    async startConversation(data: SendMessageRequest): Promise<LLMSendMessageResponse> {
        return http.post<LLMSendMessageResponse>(`${ENDPOINTS.CHAT.PREFIX}${ENDPOINTS.CHAT.NEW_MESSAGE}`, data);
    },

    async sendMessage(data: MessageData): Promise<LLMSendMessageResponse> {
        return http.post<LLMSendMessageResponse>(`${ENDPOINTS.CHAT.PREFIX}${ENDPOINTS.CHAT.MESSAGES(data.conversation_id)}`, data);
    },
};
