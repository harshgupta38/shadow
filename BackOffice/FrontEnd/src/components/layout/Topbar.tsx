import { useState } from "react";
import { Dropdown } from "react-bootstrap";
import { List, BoxArrowRight, PersonFill } from "react-bootstrap-icons";
import { Brand } from "@/components/ui/Brand/Brand";
import { ThemeToggle } from "@/components/ui/ThemeToggle/ThemeToggle";
import { useAuth } from "@/context/AuthContext";

interface TopbarProps {
  onOpenMenu: () => void;
}

export function Topbar({ onOpenMenu }: TopbarProps) {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const avatarLabel = (user?.name ?? "A")
    .trim()
    .slice(0, 2)
    .toUpperCase();

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

      <Brand size="md" />

      <div className="ms-auto d-flex align-items-center gap-1">
        <ThemeToggle />

        <Dropdown align="end" show={isOpen} onToggle={setIsOpen}>
          <Dropdown.Toggle
            as="button"
            className="btn btn-ghost d-flex align-items-center gap-2 ps-1 pe-2 border-0"
            id="topbar-user-menu"
            style={{ borderRadius: "var(--jv-radius-pill)" }}
          >
            <span className="avatar avatar-sm">{avatarLabel}</span>
            <span className="d-none d-md-inline fw-semibold small">
              {user?.name ?? "Admin"}
            </span>
          </Dropdown.Toggle>

          <Dropdown.Menu style={{ minWidth: 220 }}>
            <div className="px-3 py-2 d-flex align-items-center gap-2">
              <span className="avatar avatar-md">{avatarLabel}</span>
              <div className="min-w-0">
                <div className="fw-semibold small text-truncate">
                  {user?.name ?? "Admin"}
                </div>
                <div className="text-faint text-truncate" style={{ fontSize: "0.72rem" }}>
                  {user?.role ?? "Administrator"}
                </div>
              </div>
            </div>
            <Dropdown.Divider />
            <Dropdown.Item className="d-flex align-items-center gap-2" disabled>
              <PersonFill size={15} /> Profile
            </Dropdown.Item>
            <Dropdown.Divider />
            <Dropdown.Item
              className="d-flex align-items-center gap-2 text-danger"
              onClick={logout}
            >
              <BoxArrowRight size={15} /> Sign out
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
      </div>
    </header>
  );
}
