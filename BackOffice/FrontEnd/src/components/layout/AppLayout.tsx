import { useEffect, useState } from "react";
import { Offcanvas } from "react-bootstrap";
import { Outlet, useLocation } from "react-router-dom";
import { Brand } from "@/components/ui/Brand/Brand";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { ROUTES } from "@/routes/RoutePaths";

const COLLAPSE_BREAKPOINT = "(max-width: 1024px)";

// Pages too complex for the normal padded/max-width page shell — they get
// the full viewport below the topbar instead (see .app-content-full).
const FULL_BLEED_ROUTES: readonly string[] = [ROUTES.SHADOW_DATABASE, ROUTES.SHADOW_LOGS];

export function AppLayout() {
  const location = useLocation();
  const isFullBleed = FULL_BLEED_ROUTES.includes(location.pathname);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => window.innerWidth <= 1024,
  );

  useEffect(() => {
    const mql = window.matchMedia(COLLAPSE_BREAKPOINT);
    const handleChange = (e: MediaQueryListEvent) =>
      setSidebarCollapsed(e.matches);
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  return (
    <div className="app-shell">
      <Topbar onOpenMenu={() => setMobileNavOpen(true)} />

      <div className="app-body">
        <aside
          className={`sidebar sidebar-desktop${sidebarCollapsed ? " sidebar--collapsed" : ""}`}
        >
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
            onNavigate={() => {
              if (window.innerWidth >= 769 && window.innerWidth <= 1024) {
                setSidebarCollapsed(true);
              }
            }}
          />
        </aside>

        <Offcanvas
          show={mobileNavOpen}
          onHide={() => setMobileNavOpen(false)}
          responsive="lg"
          className="d-lg-none"
          style={{ width: "var(--jv-sidebar-w)" }}
        >
          <Offcanvas.Header closeButton>
            <Brand size="sm" />
          </Offcanvas.Header>
          <Offcanvas.Body className="pt-0">
            <Sidebar onNavigate={() => setMobileNavOpen(false)} />
          </Offcanvas.Body>
        </Offcanvas>

        <div className="app-main">
          <main className={isFullBleed ? "app-content-full fade-in" : "app-content fade-in"}>
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
