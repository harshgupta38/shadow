import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "@/context/AuthContext";
import { ROUTES } from "@/routes/RoutePaths";
import { ChildProps } from "@/api/types";

/** Requires a signed-in user. Redirects to /login otherwise. */
export function RequireAuth({ children }: ChildProps) {
    const { status, isAuthenticated } = useAuth();
    const location = useLocation();

    if (status === "loading")
        return null; // TODO: splash screen

    if (!isAuthenticated)
        return <Navigate to={ROUTES.LOGIN} replace state={{ from: location }} />;

    return children ? <>{children}</> : <Outlet />;
}

/**
 * Blocks access to app pages when the user has exceeded their device limit.
 * Redirects to /device-limit so they can revoke a session before continuing.
 */
export function RequireDeviceCheck({ children }: ChildProps) {
    const { sessionLimitExceeded } = useAuth();
    const location = useLocation();

    // Already on the device-limit page — let it through
    if (location.pathname === ROUTES.DEVICE_LIMIT)
        return children ? <>{children}</> : <Outlet />;

    if (sessionLimitExceeded)
        return <Navigate to={ROUTES.DEVICE_LIMIT} replace />;

    return children ? <>{children}</> : <Outlet />;
}

/** For /login and /register — redirects signed-in users away. */
export function PublicOnly({ children }: ChildProps) {
    const { status, isAuthenticated } = useAuth();

    if (status === "loading")
        return null;

    if (isAuthenticated)
        return <Navigate to={ROUTES.DASHBOARD} replace />;

    return children ? <>{children}</> : <Outlet />;
}
