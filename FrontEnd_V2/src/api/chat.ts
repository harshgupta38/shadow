import { ENDPOINTS } from "@/constant/shadow-endpoints";

import { http } from "@/api/client";
import {
    ConvoDataShortResponse,
    MessageChunkResponse,
    NewConvoRequest,
    NewConvoResponse,
    RenameConvoRequest,
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

    async startConversation(data: NewConvoRequest): Promise<NewConvoResponse> {
        return http.post<NewConvoResponse>(`${ENDPOINTS.CHAT.PREFIX}${ENDPOINTS.CHAT.NEW_MESSAGE}`, data);
    },

    async sendMessage(data: NewConvoRequest): Promise<NewConvoResponse> {
        return http.post<NewConvoResponse>(`${ENDPOINTS.CHAT.PREFIX}${ENDPOINTS.CHAT.MESSAGES(data.conversation_id)}`, data);
    },
};
