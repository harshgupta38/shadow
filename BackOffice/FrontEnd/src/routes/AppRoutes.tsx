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

const LogsPage = lazy(() =>
  import("@/pages/logs/LogsPage").then((m) => ({ default: m.LogsPage })),
);

const ShadowUsersPage = lazy(() =>
  import("@/pages/users/ShadowUsersPage").then((m) => ({ default: m.ShadowUsersPage })),
);

const BackOfficeUsersPage = lazy(() =>
  import("@/pages/users/BackOfficeUsersPage").then((m) => ({ default: m.BackOfficeUsersPage })),
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
            {/* Pages shared by both apps get a key per app: the Shadow and BackOffice routes render
                the same component, so without it React reuses the instance when you switch and
                keeps the other app's data (commits, branch, page, open log) until a full refresh. */}
            <Route path={ROUTES.HOME}     element={<DashboardPage />} />
            <Route path={ROUTES.DEPLOY}   element={<DeployPage key="shadow" app="shadow" />} />
            <Route path={ROUTES.DATABASE} element={<DatabasePage key="shadow" app="shadow" />} />
            <Route path={ROUTES.SERVER}   element={<ServerPage key="shadow" app="shadow" />} />

            <Route path={ROUTES.SHADOW_USERS}      element={<ShadowUsersPage />} />
            <Route path={ROUTES.SHADOW_DATABASE}   element={<DatabasePage key="shadow" app="shadow" />} />
            <Route path={ROUTES.SHADOW_DEPLOYMENT} element={<DeployPage key="shadow" app="shadow" />} />
            <Route path={ROUTES.SHADOW_SERVER}     element={<ServerPage key="shadow" app="shadow" />} />
            <Route path={ROUTES.SHADOW_LOGS}       element={<LogsPage key="shadow" app="shadow" />} />
            <Route path={ROUTES.BACKOFFICE_USERS}      element={<BackOfficeUsersPage />} />
            <Route path={ROUTES.BACKOFFICE_DATABASE}   element={<DatabasePage key="backoffice" app="backoffice" />} />
            <Route path={ROUTES.BACKOFFICE_DEPLOYMENT} element={<DeployPage key="backoffice" app="backoffice" />} />
            <Route path={ROUTES.BACKOFFICE_SERVER}     element={<ServerPage key="backoffice" app="backoffice" />} />
            <Route path={ROUTES.BACKOFFICE_LOGS}       element={<LogsPage key="backoffice" app="backoffice" />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to={ROUTES.HOME} replace />} />
      </Routes>
    </Suspense>
  );
}
