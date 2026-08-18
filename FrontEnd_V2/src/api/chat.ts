import { ENDPOINTS } from "@/constant/shadow-endpoints";

import { http } from "@/api/client";
import {
    ConvoDataShortResponse,
    MessageChunkResponse,
    NewConvoRequest,
    MessageResponse,
    RenameConvoRequest,
    RegenerateResponseRequest,
    MessageRequest,
} from "@/api/types";

export const chatApi = {
    async getConversations(): Promise<ConvoDataShortResponse[]> {
        return http.get<ConvoDataShortResponse[]>(`${ENDPOINTS.CHAT.PREFIX}${ENDPOINTS.CHAT.CONVERSATIONS}`);
    },

    async getMessages(conversationId: number): Promise<MessageChunkResponse> {
        return http.get<MessageChunkResponse>(`${ENDPOINTS.CHAT.PREFIX}${ENDPOINTS.CHAT.MESSAGES(conversationId)}`);
    },

    async deleteConversation(conversationId: number): Promise<void> {
        return http.delete<void>(`${ENDPOINTS.CHAT.PREFIX}${ENDPOINTS.CHAT.CONVERSATION_DETAIL(conversationId)}`);
    },

    async renameConversation(conversationId: number, data: RenameConvoRequest): Promise<ConvoDataShortResponse> {
        return http.patch<ConvoDataShortResponse>(`${ENDPOINTS.CHAT.PREFIX}${ENDPOINTS.CHAT.CONVERSATION_DETAIL(conversationId)}`, data);
    },

    async startConversation(data: NewConvoRequest): Promise<MessageResponse> {
        return http.post<MessageResponse>(`${ENDPOINTS.CHAT.PREFIX}${ENDPOINTS.CHAT.NEW_MESSAGE}`, data);
    },

    async sendMessage(data: MessageRequest): Promise<MessageResponse> {
        return http.post<MessageResponse>(`${ENDPOINTS.CHAT.PREFIX}${ENDPOINTS.CHAT.MESSAGES(data.conversation_id)}`, data);
    },

    async regenerateResponse(data: RegenerateResponseRequest): Promise<MessageResponse> {
        return http.post<MessageResponse>(`${ENDPOINTS.CHAT.PREFIX}${ENDPOINTS.CHAT.REGENERATE_RESPONSE(data.conversation_id, data.message_id)}`, data);
    },
};
