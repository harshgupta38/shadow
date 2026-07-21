import { ENDPOINTS } from "@/constant/shadow-endpoints";
import { http, tokenStore } from "./client";
import { LoginRequest, Token, User } from "./types";

export const authApi = {
    async login(data: LoginRequest): Promise<Token> {
        const token = await http.post<Token>(ENDPOINTS.AUTH.LOGIN, data);
        tokenStore.set(token.access_token);
        return token;
    },
    async me(): Promise<User> {
        return http.get<User>(ENDPOINTS.AUTH.ME);
    },
    logout(): void {
        tokenStore.clear();
    },
};