import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";

import { api, tokenStore, LoginRequest, RegisterRequest, type ThemePreference, type UserDataResponse, type WeekStartsOn } from "@/api";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

function dispatchThemeSync(preference: ThemePreference): void {
    window.dispatchEvent(new CustomEvent<{ preference: ThemePreference }>("theme:sync", { detail: { preference } }));
}

function dispatchPlannerSync(weekStartsOn: WeekStartsOn): void {
    window.dispatchEvent(new CustomEvent<{ week_starts_on: WeekStartsOn }>("planner:sync", { detail: { week_starts_on: weekStartsOn } }));
}

interface AuthContextValue {
    user: UserDataResponse | null;
    status: AuthStatus;
    isAuthenticated: boolean;
    login: (data: LoginRequest) => Promise<UserDataResponse>;
    logout: () => void;
    register: (data: RegisterRequest) => Promise<UserDataResponse>;
    refreshUser: () => Promise<UserDataResponse>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<UserDataResponse | null>(null);
    const [status, setStatus] = useState<AuthStatus>("loading");

    const login = useCallback(async (data: LoginRequest) => {
        await api.auth.login(data);
        const user = await api.auth.me();
        setUser(user);
        setStatus("authenticated");
        dispatchThemeSync(user.theme_preference);
        dispatchPlannerSync(user.planner.week_starts_on);
        return user;
    }, []);

    const logout = useCallback(() => {
        api.auth.logout();
        setUser(null);
        setStatus("unauthenticated");
    }, []);

    const register = useCallback(async (data: RegisterRequest) => {
        await api.auth.register(data);
        const user = await api.auth.me();
        setUser(user);
        setStatus("authenticated");
        dispatchThemeSync(user.theme_preference);
        dispatchPlannerSync(user.planner.week_starts_on);
        return user;
    }, []);

    const refreshUser = useCallback(async () => {
        const user = await api.auth.me();
        setUser(user);
        setStatus("authenticated");
        dispatchThemeSync(user.theme_preference);
        dispatchPlannerSync(user.planner.week_starts_on);
        return user;
    }, []);

    useEffect(() => {
        if (!tokenStore.get()) {
            setStatus("unauthenticated");
            return;
        }

        const restoreSession = async () => {
            try {
                const user = await api.auth.me();
                setUser(user);
                setStatus("authenticated");
                dispatchThemeSync(user.theme_preference);
                dispatchPlannerSync(user.planner.week_starts_on);
            } catch {
                api.auth.logout();
                // setUser(null); // No need for this, because user is already null on startup
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

    const value = useMemo<AuthContextValue>(
        () => ({
            user, // provides the current user object (or null if not logged in)
            status, // provides the current authentication status ("loading", "authenticated", or "unauthenticated")
            isAuthenticated: status === "authenticated" && !!user,
            login, // login user, which updates the user state and authentication status
            logout, // logout user, which clears the user state and sets the authentication status to "unauthenticated"
            register, // register user, which updates the user state and authentication status
            refreshUser,
        }),
        [user, status, login, logout, register, refreshUser], // We declare that when these items update, create a new object
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