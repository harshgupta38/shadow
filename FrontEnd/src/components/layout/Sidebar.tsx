import { NavLink } from "react-router-dom";
import { BoxArrowRight, GearFill } from "react-bootstrap-icons";

import { Avatar } from "@/components/ui/Avatar";
import { Brand } from "@/components/ui/Brand";
import { useAuth } from "@/context/AuthContext";
import { NAV_SECTIONS } from "@/lib/nav";

interface SidebarProps {
  /** Called when a nav item is clicked (used to close the mobile drawer). */
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const { user, logout } = useAuth();

  return (
    <div className="d-flex flex-column h-100">
      <div className="px-2 mb-3">
        <Brand subtitle="Life & career coach" />
      </div>

      <nav className="flex-grow-1 d-flex flex-column gap-1 overflow-auto">
        {NAV_SECTIONS.map((section, index) => (
          <div key={section.label ?? index} className="mb-1">
            {section.label && <div className="nav-section-label">{section.label}</div>}
            {section.items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `nav-link-jv ${isActive ? "active" : ""}`.trim()
                  }
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="surface-2 p-2 mt-2 d-flex align-items-center gap-2">
        <Avatar name={user?.name ?? "You"} size="sm" />
        <div className="flex-grow-1 min-w-0">
          <div className="fw-semibold small text-truncate">{user?.name ?? "You"}</div>
          <div className="text-faint text-truncate" style={{ fontSize: "0.72rem" }}>
            {user?.email}
          </div>
        </div>
        <NavLink
          to="/settings"
          onClick={onNavigate}
          className="btn btn-ghost btn-icon"
          style={{ width: 34, height: 34 }}
          aria-label="Settings"
          title="Settings"
        >
          <GearFill size={15} />
        </NavLink>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          style={{ width: 34, height: 34 }}
          aria-label="Sign out"
          title="Sign out"
          onClick={logout}
        >
          <BoxArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
