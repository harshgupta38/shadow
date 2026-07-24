import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";

import { api, tokenStore, LoginRequest, type User } from "@/api";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
    user: User | null;
    status: AuthStatus;
    isAuthenticated: boolean;
    login: (data: LoginRequest) => Promise<User>;
    logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [status, setStatus] = useState<AuthStatus>("loading");

    /**
     * Use Effect is a react feature that checked if any data is already implemented,
     * like user already logged in, theme already set, etc. 
     * If so, it will not re-render the page and will not call the login function again.
     */
    // useEffect(() => {
    // Use this for theme effect check (Future)
    // }, []);

    const login = useCallback(async (data: LoginRequest) => {
        await api.auth.login(data);
        const user = await api.auth.me();
        setUser(user);
        setStatus("authenticated");
        return user;
    }, []); // Empty dependency array ensures this function is never recreated, which is important for consumers that use it in useEffect.

    const logout = useCallback(() => {
        api.auth.logout();
        setUser(null);
        setStatus("unauthenticated");
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
            } catch {
                api.auth.logout();
                // setUser(null); // No need for this, because user is already null on startup
                setStatus("unauthenticated");
            }
        };

        restoreSession();
    }, []);

    const value = useMemo<AuthContextValue>(
        () => ({
            user, // provides the current user object (or null if not logged in)
            status, // provides the current authentication status ("loading", "authenticated", or "unauthenticated")
            isAuthenticated: status === "authenticated" && !!user,
            login, // login user, which updates the user state and authentication status
            logout, // logout user, which clears the user state and sets the authentication status to "unauthenticated"
        }),
        [user, status, login, logout], // We declare that when these three items update, create a new object
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