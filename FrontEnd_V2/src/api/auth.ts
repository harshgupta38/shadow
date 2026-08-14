import { ENDPOINTS } from "@/constant/shadow-endpoints";
import { http, tokenStore } from "@/api/client";
import { LoginRequest, TokenResponse, UserDataResponse, RegisterRequest } from "@/api/types";

export const authApi = {
    async register(data: RegisterRequest): Promise<TokenResponse> {
        const token = await http.post<TokenResponse>(ENDPOINTS.AUTH.REGISTER, data);
        tokenStore.set(token.access_token);
        return token;
    },
    async login(data: LoginRequest): Promise<TokenResponse> {
        const token = await http.post<TokenResponse>(ENDPOINTS.AUTH.LOGIN, data);
        tokenStore.set(token.access_token);
        return token;
    },
    async me(): Promise<UserDataResponse> {
        return http.get<UserDataResponse>(ENDPOINTS.AUTH.USER_DATA);
    },
    logout(): void {
        tokenStore.clear();
    },
};