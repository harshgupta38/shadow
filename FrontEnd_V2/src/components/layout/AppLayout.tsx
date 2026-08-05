import { useState } from "react";
import { Offcanvas } from "react-bootstrap";
import { Outlet } from "react-router-dom";

import { Brand } from "@/components/ui/Brand";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";

export function AppLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="app-shell">
      <aside className="sidebar sidebar-desktop">
        <Sidebar />
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
        <Topbar onOpenMenu={() => setMobileNavOpen(true)} />
        <main className="app-content fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  );
}