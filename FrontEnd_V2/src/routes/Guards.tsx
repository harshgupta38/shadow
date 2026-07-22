import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "@/context/AuthContext";
import { ROUTES } from "./RoutePaths";

interface GuardProps {
	children?: ReactNode;
}

export function RequireAuth({ children }: GuardProps) {
	const { status, isAuthenticated } = useAuth();
	const location = useLocation(); // this gives us the location user came from, so that after login we go this page instead of default homepage

	if (status === "loading") {
		return null; // TODO: In future we will implement a splach screen for this
	}

	if (!isAuthenticated) {
		return <Navigate to={ROUTES.LOGIN} replace state={{ from: location }} />;
	}

	return children ? <>{children}</> : <Outlet />;
}