import { ENDPOINTS } from "@/constant/shadow-endpoints";
import { http, tokenStore } from "@/api/client";
import { LoginRequest, TokenResponse, UserDataResponse, RegisterRequest } from "@/api/types";

function storeTokens(token: TokenResponse): void {
    tokenStore.set(token.access_token);
    tokenStore.setRefreshToken(token.refresh_token);
}

export const authApi = {
    async register(data: RegisterRequest): Promise<TokenResponse> {
        const token = await http.post<TokenResponse>(`${ENDPOINTS.AUTH.PREFIX}${ENDPOINTS.AUTH.REGISTER}`, data);
        storeTokens(token);
        return token;
    },
    async login(data: LoginRequest): Promise<TokenResponse> {
        const token = await http.post<TokenResponse>(`${ENDPOINTS.AUTH.PREFIX}${ENDPOINTS.AUTH.LOGIN}`, data);
        storeTokens(token);
        return token;
    },
    async me(): Promise<UserDataResponse> {
        return http.get<UserDataResponse>(`${ENDPOINTS.AUTH.PREFIX}${ENDPOINTS.AUTH.USER_DATA}`);
    },
    logout(): void {
        tokenStore.clear();
        tokenStore.clearRefreshToken();
    },
};