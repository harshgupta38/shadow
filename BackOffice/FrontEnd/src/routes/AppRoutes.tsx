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
            <Route path={ROUTES.DEPLOY}   element={<ComingSoon label="Deploy" />} />
            <Route path={ROUTES.DATABASE} element={<ComingSoon label="Database" />} />
            <Route path={ROUTES.SERVER}   element={<ComingSoon label="Server" />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to={ROUTES.HOME} replace />} />
      </Routes>
    </Suspense>
  );
}

function ComingSoon({ label }: { label: string }) {
  return (
    <div style={{ textAlign: "center", padding: "4rem 0", color: "var(--jv-muted)" }}>
      <p style={{ fontFamily: "var(--jv-font-display)", fontSize: "1.5rem", fontWeight: 800, color: "var(--jv-text)", marginBottom: "0.5rem" }}>
        {label}
      </p>
      <p style={{ fontSize: "0.9rem" }}>Coming in the next stage.</p>
    </div>
  );
}
