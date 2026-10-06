import { useEffect, useState } from "react";
import { Offcanvas } from "react-bootstrap";
import { Outlet } from "react-router-dom";

import { Brand } from "@/components/ui/Brand/Brand";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";

const COLLAPSE_BREAKPOINT = "(max-width: 1024px)";

export function AppLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.innerWidth <= 1024);

  useEffect(() => {
    const mql = window.matchMedia(COLLAPSE_BREAKPOINT);
    const handleChange = (e: MediaQueryListEvent) => setSidebarCollapsed(e.matches);
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  return (
    <div className="app-shell">
      <Topbar onOpenMenu={() => setMobileNavOpen(true)} />

      <div className="app-body">
        <aside className={`sidebar sidebar-desktop${sidebarCollapsed ? " sidebar--collapsed" : ""}`}>
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
          <main className="app-content fade-in">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}