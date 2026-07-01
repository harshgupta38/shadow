import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { api, tokenStore, UNAUTHORIZED_EVENT, type RegisterRequest, type User } from "@/api";
import { useTheme } from "./ThemeContext";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  user: User | null;
  status: AuthStatus;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (data: RegisterRequest) => Promise<User>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  /** Merge a partial update into the cached user (after a profile save). */
  patchUser: (patch: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const { setTheme } = useTheme();
  const syncedUserId = useRef<number | null>(null);

  // Keep the active theme in sync with the user's saved preference — but only
  // once per login so it never fights a manual toggle mid-session.
  useEffect(() => {
    if (user && user.id !== syncedUserId.current) {
      syncedUserId.current = user.id;
      setTheme(user.theme_preference);
    }
  }, [user, setTheme]);

  const logout = useCallback(() => {
    api.auth.logout();
    setUser(null);
    syncedUserId.current = null;
    setStatus("unauthenticated");
  }, []);

  // Bootstrap: restore the session from a stored token on first load.
  useEffect(() => {
    let active = true;
    if (!tokenStore.get()) {
      setStatus("unauthenticated");
      return;
    }
    api.auth
      .me()
      .then((u) => {
        if (!active) return;
        setUser(u);
        setStatus("authenticated");
      })
      .catch(() => {
        if (!active) return;
        tokenStore.clear();
        setStatus("unauthenticated");
      });
    return () => {
      active = false;
    };
  }, []);

  // A 401 anywhere in the app ends the session.
  useEffect(() => {
    const handler = () => logout();
    window.addEventListener(UNAUTHORIZED_EVENT, handler);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handler);
  }, [logout]);

  const login = useCallback(async (email: string, password: string) => {
    await api.auth.login({ email, password });
    const u = await api.auth.me();
    setUser(u);
    setStatus("authenticated");
    return u;
  }, []);

  const register = useCallback(async (data: RegisterRequest) => {
    await api.auth.register(data);
    await api.auth.login({ email: data.email, password: data.password });
    const u = await api.auth.me();
    setUser(u);
    setStatus("authenticated");
    return u;
  }, []);

  const refreshUser = useCallback(async () => {
    const u = await api.auth.me();
    setUser(u);
  }, []);

  const patchUser = useCallback((patch: Partial<User>) => {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      isAuthenticated: status === "authenticated" && !!user,
      login,
      register,
      logout,
      refreshUser,
      patchUser,
    }),
    [user, status, login, register, logout, refreshUser, patchUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
