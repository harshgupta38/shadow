import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";

import { api, LoginRequest, RegisterRequest, type AccessibilitySettings, type PlannerSettings, type ThemePreference, type UserDataResponse } from "@/api";
import { refreshAccessToken } from "@/api/client";
import { ENDPOINTS } from "@/constant/shadow-endpoints";
import { clearSessionHint, markSessionKnown } from "@/services/session-hint.service";
import { TIMING } from "@/constant/tuning";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

function dispatchThemeSync(preference: ThemePreference): void {
    window.dispatchEvent(new CustomEvent<{ preference: ThemePreference }>("theme:sync", { detail: { preference } }));
}

function dispatchPlannerSync(planner: PlannerSettings): void {
    window.dispatchEvent(new CustomEvent("planner:sync", { detail: planner }));
}

function dispatchAccessibilitySync(accessibility: AccessibilitySettings): void {
    window.dispatchEvent(new CustomEvent("accessibility:sync", { detail: accessibility }));
}

interface AuthContextValue {
    user: UserDataResponse | null;
    status: AuthStatus;
    isAuthenticated: boolean;
    sessionLimitExceeded: boolean;
    login: (data: LoginRequest) => Promise<UserDataResponse>;
    logout: () => void;
    register: (data: RegisterRequest) => Promise<UserDataResponse>;
    refreshUser: () => Promise<UserDataResponse>;
    clearSessionLimit: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<UserDataResponse | null>(null);
    const [status, setStatus] = useState<AuthStatus>("loading");
    const [sessionLimitExceeded, setSessionLimitExceeded] = useState(false);

    const login = useCallback(async (data: LoginRequest) => {
        await api.auth.login(data);
        const userData = await api.auth.me();
        markSessionKnown();
        setSessionLimitExceeded(userData.session_limit_exceeded);
        setUser(userData);
        setStatus("authenticated");
        dispatchThemeSync(userData.theme_preference);
        dispatchPlannerSync(userData.planner);
        dispatchAccessibilitySync(userData.accessibility);
        return userData;
    }, []);

    const logout = useCallback(() => {
        void api.auth.logout();
        clearSessionHint();
        setUser(null);
        setStatus("unauthenticated");
        setSessionLimitExceeded(false);
    }, []);

    const register = useCallback(async (data: RegisterRequest) => {
        await api.auth.register(data);
        const userData = await api.auth.me();
        markSessionKnown();
        setSessionLimitExceeded(userData.session_limit_exceeded);
        setUser(userData);
        setStatus("authenticated");
        dispatchThemeSync(userData.theme_preference);
        dispatchPlannerSync(userData.planner);
        dispatchAccessibilitySync(userData.accessibility);
        return userData;
    }, []);

    const refreshUser = useCallback(async () => {
        const userData = await api.auth.me();
        markSessionKnown();
        setSessionLimitExceeded(userData.session_limit_exceeded);
        setUser(userData);
        setStatus("authenticated");
        dispatchThemeSync(userData.theme_preference);
        dispatchPlannerSync(userData.planner);
        dispatchAccessibilitySync(userData.accessibility);
        return userData;
    }, []);

    const clearSessionLimit = useCallback(() => {
        setSessionLimitExceeded(false);
    }, []);

    useEffect(() => {
        const restoreSession = async () => {
            try {
                const userData = await api.auth.me();
                markSessionKnown();
                setSessionLimitExceeded(userData.session_limit_exceeded);
                setUser(userData);
                setStatus("authenticated");
                dispatchThemeSync(userData.theme_preference);
                dispatchPlannerSync(userData.planner);
                dispatchAccessibilitySync(userData.accessibility);
            } catch {
                clearSessionHint();
                setStatus("unauthenticated");
            }
        };

        restoreSession();
    }, []);

    useEffect(() => {
        const handleUnauthorized = () => logout();
        window.addEventListener("unauthorized", handleUnauthorized);
        return () => window.removeEventListener("unauthorized", handleUnauthorized);
    }, [logout]);

    // SSE listener: log out immediately when this session is revoked from another device
    useEffect(() => {
        if (status !== "authenticated") return;

        const controller = new AbortController();
        const { signal } = controller;
        const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api";
        const url = `${apiBase}${ENDPOINTS.AUTH.PREFIX}${ENDPOINTS.AUTH.SESSION_EVENTS}`;

        const connect = async () => {
            while (!signal.aborted) {
                try {
                    let response = await fetch(url, {
                        credentials: "include",
                        headers: { Accept: "text/event-stream" },
                        signal,
                    });
                    if (response.status === 401) {
                        try { await refreshAccessToken(); continue; }
                        catch { break; }
                    }
                    if (!response.ok || !response.body) {
                        await new Promise<void>((r) => setTimeout(r, TIMING.SSE_RETRY_DELAY_MS));
                        continue;
                    }
                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();
                    let buffer = "";
                    outer: while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        buffer += decoder.decode(value, { stream: true });
                        const blocks = buffer.split("\n\n");
                        buffer = blocks.pop()!;
                        for (const block of blocks) {
                            for (const line of block.split("\n")) {
                                if (line.startsWith("data: ")) {
                                    try {
                                        const evt = JSON.parse(line.slice(6)) as { type: string };
                                        if (evt.type === "logout") {
                                            try { sessionStorage.setItem("shadow.forced_logout", "Your session was signed out from another device."); } catch { /* ignore */ }
                                            logout();
                                            break outer;
                                        }
                                    } catch { /* ignore */ }
                                }
                            }
                        }
                    }
                } catch {
                    if (signal.aborted) break;
                    await new Promise<void>((r) => setTimeout(r, TIMING.SSE_RETRY_DELAY_MS));
                }
            }
        };

        void connect();
        return () => controller.abort();
    }, [status, logout]);

    const value = useMemo<AuthContextValue>(
        () => ({
            user,
            status,
            isAuthenticated: status === "authenticated" && !!user,
            sessionLimitExceeded,
            login,
            logout,
            register,
            refreshUser,
            clearSessionLimit,
        }),
        [user, status, sessionLimitExceeded, login, logout, register, refreshUser, clearSessionLimit],
    );

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const auth = useContext(AuthContext);
    if (!auth) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return auth;
}
