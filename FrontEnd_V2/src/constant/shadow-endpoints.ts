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
    },
    // DEMO: {
    //     DETAIL: (id: string) => `/demo/${id}`,
    // },
}