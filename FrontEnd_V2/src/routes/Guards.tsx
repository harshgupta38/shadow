import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "@/context/AuthContext";
import { ROUTES } from "./RoutePaths";
import { ChildProps } from "@/api/types";

/** Requires a signed-in user. Redirects to /login otherwise. */
export function RequireAuth({ children }: ChildProps) {
	const { status, isAuthenticated } = useAuth();
	const location = useLocation(); // this gives us the location user came from, so that after login we go this page instead of default homepage

	if (status === "loading")
		return null; // TODO: In future we will implement a splach screen for this

	if (!isAuthenticated)
		return <Navigate to={ROUTES.LOGIN} replace state={{ from: location }} />;

	return children ? <>{children}</> : <Outlet />;
}

/** For /login and /register — redirects signed-in users away. */
export function PublicOnly({ children }: ChildProps) {
	const { status, isAuthenticated } = useAuth();

	if (status === "loading")
		return null; // TODO: In future we will implement a splach screen for this

	if (isAuthenticated)
		return <Navigate to={ROUTES.DASHBOARD} replace />;

	return children ? <>{children}</> : <Outlet />;
}