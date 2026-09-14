import { ENDPOINTS } from "@/constant/shadow-endpoints";
import { http } from "@/api/client";
import {
    LoginRequest,
    TokenResponse,
    UserDataResponse,
    RegisterRequest,
    SessionsListResponse,
} from "@/api/types";

export const authApi = {
    async register(data: RegisterRequest): Promise<TokenResponse> {
        return http.post<TokenResponse>(
            `${ENDPOINTS.AUTH.PREFIX}${ENDPOINTS.AUTH.REGISTER}`,
            data,
        );
    },

    async login(data: LoginRequest): Promise<TokenResponse> {
        return http.post<TokenResponse>(
            `${ENDPOINTS.AUTH.PREFIX}${ENDPOINTS.AUTH.LOGIN}`,
            data,
        );
    },

    async me(): Promise<UserDataResponse> {
        return http.get<UserDataResponse>(`${ENDPOINTS.AUTH.PREFIX}${ENDPOINTS.AUTH.USER_DATA}`);
    },

    async logout(): Promise<void> {
        try {
            await http.post<void>(`${ENDPOINTS.AUTH.PREFIX}${ENDPOINTS.AUTH.LOGOUT}`, {});
        } catch {
            // best-effort — server clears cookies via Set-Cookie on success
        }
    },

    async getSessions(): Promise<SessionsListResponse> {
        return http.get<SessionsListResponse>(`${ENDPOINTS.AUTH.PREFIX}${ENDPOINTS.AUTH.SESSIONS}`);
    },

    async revokeSession(sessionId: number): Promise<void> {
        await http.delete<void>(
            `${ENDPOINTS.AUTH.PREFIX}${ENDPOINTS.AUTH.SESSION_DETAIL(sessionId)}`,
        );
    },
};
