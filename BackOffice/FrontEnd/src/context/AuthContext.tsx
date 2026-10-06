import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "@/api";
import type { AuthUser, LoginRequest } from "@/api";
import { clearToken, getToken, setToken } from "@/lib/auth-token";

// ─── Types ────────────────────────────────────────────────────────────────────
export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  isAuthenticated: boolean;
  login: (data: LoginRequest) => Promise<AuthUser>;
  logout: () => void;
}

// ─── Context ─────────────────────────────────────────────────────────────────
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ─── Provider ────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  // Restore session on mount — skipped entirely with no stored token
  // (first visit, or after a logout) rather than firing /auth/me just to
  // watch it 401: one less pointless round trip, and one less in-flight
  // request that could theoretically still straddle a fast login even
  // with client.ts's own race guard already covering that case.
  useEffect(() => {
    if (!getToken()) {
      setStatus("unauthenticated");
      return;
    }
    api.auth
      .me()
      .then((u) => {
        setUser(u);
        setStatus("authenticated");
      })
      .catch(() => {
        setStatus("unauthenticated");
      });
  }, []);

  // Respond to 401s on protected requests (fired by the axios interceptor)
  useEffect(() => {
    function handleUnauthorized() {
      setUser(null);
      setStatus("unauthenticated");
    }
    window.addEventListener("unauthorized", handleUnauthorized);
    return () => window.removeEventListener("unauthorized", handleUnauthorized);
  }, []);

  const login = useCallback(async (data: LoginRequest): Promise<AuthUser> => {
    const { admin, access_token } = await api.auth.login(data);
    setToken(access_token);
    setUser(admin);
    setStatus("authenticated");
    return admin;
  }, []);

  const logout = useCallback(() => {
    api.auth.logout().catch(() => {});
    clearToken();
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, isAuthenticated: status === "authenticated", login, logout }),
    [user, status, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── Hook ────────────────────────────────────────────────────────────────────
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
