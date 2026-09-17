import { ENDPOINTS } from "@/constant/shadow-endpoints";
import { http } from "@/api/client";
import {
    LoginRequest,
    TokenResponse,
    UserDataResponse,
    RegisterRequest,
    SessionsListResponse,
    UpdateNameRequest,
    ChangePasswordRequest,
    AccountPasswordConfirmRequest,
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

    async renameSession(sessionId: number, customName: string | null): Promise<void> {
        await http.patch<void>(
            `${ENDPOINTS.AUTH.PREFIX}${ENDPOINTS.AUTH.SESSION_DETAIL(sessionId)}`,
            { custom_name: customName },
        );
    },

    async updateName(data: UpdateNameRequest): Promise<UserDataResponse> {
        return http.patch<UserDataResponse>(
            `${ENDPOINTS.AUTH.PREFIX}${ENDPOINTS.AUTH.NAME}`,
            data,
        );
    },

    async changePassword(data: ChangePasswordRequest): Promise<void> {
        await http.post<void>(`${ENDPOINTS.AUTH.PREFIX}${ENDPOINTS.AUTH.CHANGE_PASSWORD}`, data);
    },

    async resendVerificationEmail(): Promise<void> {
        await http.post<void>(`${ENDPOINTS.AUTH.PREFIX}${ENDPOINTS.AUTH.RESEND_VERIFICATION}`, {});
    },

    async deactivateAccount(data: AccountPasswordConfirmRequest): Promise<void> {
        await http.post<void>(`${ENDPOINTS.AUTH.PREFIX}${ENDPOINTS.AUTH.DEACTIVATE}`, data);
    },

    async deleteAccount(data: AccountPasswordConfirmRequest): Promise<void> {
        await http.delete<void>(`${ENDPOINTS.AUTH.PREFIX}${ENDPOINTS.AUTH.ACCOUNT}`, data);
    },
};
