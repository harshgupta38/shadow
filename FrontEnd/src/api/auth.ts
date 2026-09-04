import { ApiError, http, tokenStore } from "./client";
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
  async verifyEmail(token: string): Promise<{ detail: string }> {
    const trimmed = token.trim();
    if (!trimmed) {
      throw new ApiError({ message: "Verification link is invalid or incomplete." });
    }

    const baseURL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api";
    const response = await fetch(
      `${baseURL}/auth/verify-email?token=${encodeURIComponent(trimmed)}`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      },
    );

    let payload: { detail?: string } | null = null;
    try {
      payload = (await response.json()) as { detail?: string };
    } catch {
      payload = null;
    }

    if (!response.ok) {
      throw new ApiError({
        message:
          typeof payload?.detail === "string"
            ? payload.detail
            : "Verification failed. Please request a new link.",
        status: response.status,
      });
    }

    return {
      detail:
        typeof payload?.detail === "string"
          ? payload.detail
          : "Email verified successfully",
    };
  },
  logout(): void {
    tokenStore.clear();
  },
};
