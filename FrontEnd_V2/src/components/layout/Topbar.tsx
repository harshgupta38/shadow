import { BoxArrowRight, List, PersonCircle } from "react-bootstrap-icons";

import { ThemeToggle } from "@/components/ui/ThemeToggle/ThemeToggle";
import { Brand } from "@/components/ui/Brand/Brand";
import { useAuth } from "@/context/AuthContext";

interface TopbarProps {
  onOpenMenu: () => void;
}

export function Topbar({ onOpenMenu }: TopbarProps) {
  const { user, logout } = useAuth();

  return (
    <header className="topbar">
      <button
        type="button"
        className="btn btn-ghost btn-icon topbar-menu-btn"
        aria-label="Open menu"
        onClick={onOpenMenu}
      >
        <List size={22} />
      </button>

      <div className="d-lg-none">
        <Brand withName={false} size="sm" />
      </div>

      <div className="ms-auto d-flex align-items-center gap-2">
        <ThemeToggle />

        <span className="d-none d-sm-inline-flex align-items-center gap-2 text-muted-2 small fw-semibold">
          <PersonCircle size={17} />
          <span>{user?.name ?? "You"}</span>
        </span>

        <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>
          <BoxArrowRight size={15} className="me-1" />
          Sign out
        </button>
      </div>
    </header>
  );
}