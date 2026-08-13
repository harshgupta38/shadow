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
        GET_LIST: "/get-list",
        DETAIL: (id: number) => `/${id}`,
    },
    MILESTONES: {
        PREFIX: "/milestone",
        SAVE: "/save",
        GET_LIST: "/get-list",
        DETAIL: (id: number) => `/${id}`,
    },
    TASKS: {
        PREFIX: "/task",
        SAVE: "/save",
        GET_LIST: "/get-list",
        DETAIL: (id: number) => `/${id}`,
    },
    CHAT: {
        PREFIX: "/chat",
        CONVERSATIONS: "/conversations",
        CONVERSATION_DETAIL: (id: number) => `/conversations/${id}`,
        MESSAGES: (conversationId: number) => `/conversations/${conversationId}/messages`,
    },
    // DEMO: {
    //     DETAIL: (id: string) => `/demo/${id}`,
    // },
}