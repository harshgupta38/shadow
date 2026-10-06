/**
 * Non-sensitive, client-only hint for "has this browser ever had a session".
 *
 * Auth cookies are httpOnly — JS can't read them to know whether a session
 * might exist before asking the server. Without this hint, every context that
 * wants to call an authenticated-only endpoint on mount (e.g. dynamic theme
 * resolution) has to blindly try the call, 401, and fall through the axios
 * interceptor's refresh-then-logout cascade — wasted round trips on a browser
 * that has never logged in.
 *
 * This flag does not replace the server-side auth check (session restore via
 * /auth/my-data still must happen); it only lets *other* contexts skip their
 * own speculative authenticated calls when we already know there's nothing to
 * check. AuthContext is the sole writer; anyone can read.
 */

const KEY = "shadow_has_session";

export function markSessionKnown(): void {
    try {
        localStorage.setItem(KEY, "1");
    } catch {
        // ignore (private mode, quota, etc.)
    }
}

export function clearSessionHint(): void {
    try {
        localStorage.removeItem(KEY);
    } catch {
        // ignore
    }
}

export function hasKnownSession(): boolean {
    try {
        return localStorage.getItem(KEY) === "1";
    } catch {
        return false;
    }
}
