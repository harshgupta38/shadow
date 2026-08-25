export const ENDPOINTS = {
    AUTH: {
        LOGIN: "/auth/login",
        REGISTER: "/auth/register",
        USER_DATA: "/auth/me",
    },
    GOALS: {
        PREFIX: "/goal",
        REFINE: "/refine",
        SAVE: "/save",
        FROM_PROPOSAL: "/from-proposal",
        GET_LIST: "/get-list",
        DETAIL: (id: number) => `/${id}`,
    },
    MILESTONES: {
        PREFIX: "/milestone",
        SAVE: "/save",
        FROM_PROPOSAL: "/from-proposal",
        GET_LIST: "/get-list",
        DETAIL: (id: number) => `/${id}`,
    },
    TASKS: {
        PREFIX: "/task",
        SAVE: "/save",
        FROM_PROPOSAL: "/from-proposal",
        GET_LIST: "/get-list",
        DETAIL: (id: number) => `/${id}`,
    },
    HABITS: {
        PREFIX: "/habit",
        GET_LIST: "/get-list",
        SAVE: "/save",
        DETAIL: (id: number) => `/${id}`,
    },
    PLAN_ITEMS: {
        PREFIX: "/plan",
        GET_TODAY: "/today",
        DETAIL: (id: number) => `/${id}`,
    },
    CHAT: {
        PREFIX: "/chat",
        CONVERSATIONS: "/conversations",
        CONVERSATION_DETAIL: (id: number) => `/conversations/${id}`,
        MESSAGES: (id: number) => `/conversations/${id}/messages`,
        REGENERATE_RESPONSE: (conversation_id: number, message_id: number) => `/conversations/${conversation_id}/regenerate_response/${message_id}`,
        RETRY_FAILED_MESSAGE: (conversation_id: number, message_id: number) => `/conversations/${conversation_id}/retry_message/${message_id}`,
        NEW_MESSAGE: "/conversations/messages",
    },
}