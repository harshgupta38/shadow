import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { RequireAuth, GuestOnly } from "./Guards";
import { ROUTES } from "./RoutePaths";

const LoginPage = lazy(() =>
  import("@/pages/auth/LoginPage").then((m) => ({ default: m.LoginPage })),
);

const DashboardPlaceholder = lazy(() =>
  import("@/pages/dashboard/DashboardPlaceholder").then((m) => ({
    default: m.DashboardPlaceholder,
  })),
);

function RouteFallback() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "var(--jv-bg)",
      }}
    />
  );
}

export function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<GuestOnly />}>
          <Route path={ROUTES.LOGIN} element={<LoginPage />} />
        </Route>

        <Route element={<RequireAuth />}>
          <Route path={ROUTES.HOME} element={<DashboardPlaceholder />} />
        </Route>

        <Route path="*" element={<Navigate to={ROUTES.HOME} replace />} />
      </Routes>
    </Suspense>
  );
}
