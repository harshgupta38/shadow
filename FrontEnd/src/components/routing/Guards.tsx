import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { Brand } from "@/components/ui/Brand";
import { LoadingState } from "@/components/ui/LoadingState";
import { useAuth } from "@/context/AuthContext";

/** Full-screen splash while the session is being restored. */
function AuthSplash() {
  return (
    <div className="d-flex flex-column align-items-center justify-content-center vh-100 gap-4">
      <Brand size="lg" />
      <LoadingState label="Getting things ready…" full={false} />
    </div>
  );
}

/** Requires a signed-in user. Redirects to /login otherwise. */
export function RequireAuth({ children }: { children?: ReactNode }) {
  const { status, isAuthenticated } = useAuth();
  const location = useLocation();

  if (status === "loading") return <AuthSplash />;
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children ? <>{children}</> : <Outlet />;
}

/** Requires a signed-in user who has finished onboarding. */
export function RequireOnboarded({ children }: { children?: ReactNode }) {
  const { status, isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (status === "loading") return <AuthSplash />;
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  if (user && !user.onboarding_completed) {
    return <Navigate to="/onboarding" replace />;
  }
  return children ? <>{children}</> : <Outlet />;
}

/** For /login and /register — redirects signed-in users away. */
export function PublicOnly({ children }: { children?: ReactNode }) {
  const { status, isAuthenticated, user } = useAuth();

  if (status === "loading") return <AuthSplash />;
  if (isAuthenticated) {
    return <Navigate to={user && !user.onboarding_completed ? "/onboarding" : "/"} replace />;
  }
  return children ? <>{children}</> : <Outlet />;
}
