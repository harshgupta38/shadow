import { ENDPOINTS } from "@/constant/shadow-endpoints";
import { http, tokenStore } from "@/api/client";
import {
    LoginRequest,
    TokenResponse,
    UserDataResponse,
    RegisterRequest,
    SessionsListResponse,
} from "@/api/types";

function storeTokens(token: TokenResponse): void {
    tokenStore.set(token.access_token);
    tokenStore.setRefreshToken(token.refresh_token);
}

export const authApi = {
    async register(data: RegisterRequest): Promise<TokenResponse> {
        const token = await http.post<TokenResponse>(
            `${ENDPOINTS.AUTH.PREFIX}${ENDPOINTS.AUTH.REGISTER}`,
            data,
        );
        storeTokens(token);
        return token;
    },

    async login(data: LoginRequest): Promise<TokenResponse> {
        const token = await http.post<TokenResponse>(
            `${ENDPOINTS.AUTH.PREFIX}${ENDPOINTS.AUTH.LOGIN}`,
            data,
        );
        storeTokens(token);
        return token;
    },

    async me(): Promise<UserDataResponse> {
        return http.get<UserDataResponse>(`${ENDPOINTS.AUTH.PREFIX}${ENDPOINTS.AUTH.USER_DATA}`);
    },

    async logout(): Promise<void> {
        try {
            await http.post<void>(`${ENDPOINTS.AUTH.PREFIX}${ENDPOINTS.AUTH.LOGOUT}`, {});
        } catch {
            // best-effort — always clear local tokens
        } finally {
            tokenStore.clear();
            tokenStore.clearRefreshToken();
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
