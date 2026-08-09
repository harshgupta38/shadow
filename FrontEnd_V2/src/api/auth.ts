import { ENDPOINTS } from "@/constant/shadow-endpoints";
import { http, tokenStore } from "@/api/client";
import { LoginRequest, TokenResponse, UserData, RegisterRequest } from "@/api/types";

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
    async me(): Promise<UserData> {
        return http.get<UserData>(ENDPOINTS.AUTH.USER_DATA);
    },
    logout(): void {
        tokenStore.clear();
    },
};