import { http, tokenStore } from "./client";
import type { LoginRequest, RegisterRequest, Token, User } from "./types";

export const authApi = {
  async register(data: RegisterRequest): Promise<User> {
    return http.post<User>("/auth/register", data);
  },
  async login(data: LoginRequest): Promise<Token> {
    const token = await http.post<Token>("/auth/login", data);
    tokenStore.set(token.access_token);
    return token;
  },
  async me(): Promise<User> {
    return http.get<User>("/auth/me");
  },
  logout(): void {
    tokenStore.clear();
  },
};
