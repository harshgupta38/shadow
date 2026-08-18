import { useState } from "react";
import { Dropdown } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import { BoxArrowRight, GearFill, List, PersonCircle } from "react-bootstrap-icons";

import { ThemeToggle } from "@/components/ui/ThemeToggle/ThemeToggle";
import { Brand } from "@/components/ui/Brand/Brand";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { useAuth } from "@/context/AuthContext";
import { ROUTES } from "@/routes/RoutePaths";

interface TopbarProps {
  onOpenMenu: () => void;
}

export function Topbar({ onOpenMenu }: TopbarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);

  const handleConfirmSignOut = async () => {
    setSignOutBusy(true);
    try {
      await Promise.resolve(logout());
    } finally {
      setSignOutBusy(false);
      setShowSignOutConfirm(false);
    }
  };

  const avatarLabel = (user?.name ?? "You")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "Y";

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

      <div className="d-md-none">
        <Brand withName={false} size="sm" />
      </div>
      <div className="d-none d-md-block">
        <Brand subtitle="Life & career coach" />
      </div>

      <div className="ms-auto d-flex align-items-center gap-1">
        <ThemeToggle />

        <Dropdown align="end">
          <Dropdown.Toggle
            as="button"
            className="btn btn-ghost d-flex align-items-center gap-2 ps-1 pe-2 border-0"
            id="topbar-user-menu"
            style={{ borderRadius: "var(--jv-radius-pill)" }}
          >
            <span className="avatar avatar-sm">{avatarLabel}</span>
            <span className="d-none d-md-inline fw-semibold small">{user?.name ?? "You"}</span>
          </Dropdown.Toggle>

          <Dropdown.Menu style={{ minWidth: 230 }}>
            <div className="px-2 py-2 d-flex align-items-center gap-2">
              <span className="avatar avatar-md">{avatarLabel}</span>
              <div className="min-w-0">
                <div className="fw-semibold small text-truncate">{user?.name ?? "You"}</div>
                <div className="text-faint text-truncate" style={{ fontSize: "0.72rem" }}>
                  {user?.email ?? ""}
                </div>
              </div>
            </div>
            <Dropdown.Divider />
            <Dropdown.Item onClick={() => navigate(ROUTES.PROFILE)}>
              <PersonCircle className="me-2" size={16} /> Profile
            </Dropdown.Item>
            <Dropdown.Item onClick={() => navigate(ROUTES.SETTINGS)}>
              <GearFill className="me-2" size={16} /> Settings
            </Dropdown.Item>
            <Dropdown.Divider />
            <Dropdown.Item onClick={() => setShowSignOutConfirm(true)} className="text-danger">
              <BoxArrowRight className="me-2" size={16} /> Sign out
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>

        <ConfirmDialog
          show={showSignOutConfirm}
          title="Sign out now?"
          message="You will need to sign in again to access your account."
          confirmLabel="Sign out"
          cancelLabel="Stay signed in"
          busy={signOutBusy}
          onConfirm={() => void handleConfirmSignOut()}
          onCancel={() => setShowSignOutConfirm(false)}
        />
      </div>
    </header>
  );
}