import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { ROUTES } from "./RoutePaths";

export function RequireAuth() {
  const { status } = useAuth();
  if (status === "loading") return null;
  if (status === "unauthenticated") return <Navigate to={ROUTES.LOGIN} replace />;
  return <Outlet />;
}

export function GuestOnly() {
  const { status } = useAuth();
  if (status === "loading") return null;
  if (status === "authenticated") return <Navigate to={ROUTES.HOME} replace />;
  return <Outlet />;
}
