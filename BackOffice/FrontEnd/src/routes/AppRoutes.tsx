import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { RequireAuth, GuestOnly } from "./Guards";
import { ROUTES } from "./RoutePaths";

const LoginPage = lazy(() =>
  import("@/pages/auth/LoginPage").then((m) => ({ default: m.LoginPage })),
);

const DashboardPage = lazy(() =>
  import("@/pages/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);

const DeployPage = lazy(() =>
  import("@/pages/deploy/DeployPage").then((m) => ({ default: m.DeployPage })),
);

const DatabasePage = lazy(() =>
  import("@/pages/database/DatabasePage").then((m) => ({ default: m.DatabasePage })),
);

const ServerPage = lazy(() =>
  import("@/pages/server/ServerPage").then((m) => ({ default: m.ServerPage })),
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
          <Route element={<AppLayout />}>
            <Route path={ROUTES.HOME}     element={<DashboardPage />} />
            <Route path={ROUTES.DEPLOY}   element={<DeployPage />} />
            <Route path={ROUTES.DATABASE} element={<DatabasePage />} />
            <Route path={ROUTES.SERVER}   element={<ServerPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to={ROUTES.HOME} replace />} />
      </Routes>
    </Suspense>
  );
}
