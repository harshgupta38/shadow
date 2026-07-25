import { ENDPOINTS } from "@/constant/shadow-endpoints";
import { http, tokenStore } from "./client";
import { LoginRequest, TokenResponse, UserData, RegisterRequest } from "./types";

export const authApi = {
    async register(data: RegisterRequest): Promise<TokenResponse> {
        const token = await http.post<TokenResponse>("/auth/register", data);
        tokenStore.set(token.access_token);
        return token;
    },
    async login(data: LoginRequest): Promise<TokenResponse> {
        const token = await http.post<TokenResponse>(ENDPOINTS.AUTH.LOGIN, data);
        tokenStore.set(token.access_token);
        return token;
    },
    async me(): Promise<UserData> {
        return http.get<UserData>(ENDPOINTS.AUTH.ME);
    },
    logout(): void {
        tokenStore.clear();
    },
};