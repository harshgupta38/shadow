import { Dropdown } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import { BoxArrowRight, GearFill, List, PersonCircle, Stars } from "react-bootstrap-icons";

import { Avatar } from "@/components/ui/Avatar";
import { Brand } from "@/components/ui/Brand";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useAuth } from "@/context/AuthContext";
import { useLogoutConfirm } from "@/context/LogoutConfirmContext";
import { NotificationsBell } from "./NotificationsBell";

interface TopbarProps {
  onOpenMenu: () => void;
}

export function Topbar({ onOpenMenu }: TopbarProps) {
  const { user } = useAuth();
  const { requestLogout } = useLogoutConfirm();
  const navigate = useNavigate();

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

      <div className="ms-auto d-flex align-items-center gap-1">
        <ThemeToggle />
        <NotificationsBell />
        <Dropdown align="end">
          <Dropdown.Toggle
            as="button"
            className="btn btn-ghost d-flex align-items-center gap-2 ps-1 pe-2 border-0"
            id="user-menu"
            style={{ borderRadius: "var(--jv-radius-pill)" }}
          >
            <Avatar name={user?.name ?? "You"} size="sm" />
            <span className="d-none d-md-inline fw-semibold small">{user?.name}</span>
          </Dropdown.Toggle>
          <Dropdown.Menu style={{ minWidth: 220 }}>
            <div className="px-2 py-2 d-flex align-items-center gap-2">
              <Avatar name={user?.name ?? "You"} size="md" />
              <div className="min-w-0">
                <div className="fw-semibold small text-truncate">{user?.name}</div>
                <div className="text-faint text-truncate" style={{ fontSize: "0.72rem" }}>
                  {user?.email}
                </div>
              </div>
            </div>
            <Dropdown.Divider />
            <Dropdown.Item onClick={() => navigate("/profile")}>
              <PersonCircle className="me-2" size={16} /> Profile
            </Dropdown.Item>
            <Dropdown.Item onClick={() => navigate("/memory-center")}>
              <Stars className="me-2" size={16} /> AI Memory Center
            </Dropdown.Item>
            <Dropdown.Item onClick={() => navigate("/settings")}>
              <GearFill className="me-2" size={16} /> Settings
            </Dropdown.Item>
            <Dropdown.Divider />
            <Dropdown.Item onClick={requestLogout} className="text-danger">
              <BoxArrowRight className="me-2" size={16} /> Sign out
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
      </div>
    </header>
  );
}
