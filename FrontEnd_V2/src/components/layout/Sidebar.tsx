import { NavLink } from "react-router-dom";
import { ArrowBarLeft, ArrowBarRight, CupHotFill } from "react-bootstrap-icons";

import { NAV_SECTIONS } from "@/constant/nav";

const BUY_ME_A_COFFEE_URL = "https://buymeacoffee.com/harshgupta38";

interface SidebarProps {
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({ onNavigate, collapsed, onToggleCollapse }: SidebarProps) {
  return (
    <div className="d-flex flex-column h-100">
      <nav className="flex-grow-1 d-flex flex-column gap-1 overflow-auto">
        {NAV_SECTIONS.map((section, index) => (
          <div key={section.label ?? index} className="mb-1">
            {!collapsed && section.label && (
              <div className="nav-section-label">{section.label}</div>
            )}
            {section.items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  title={collapsed ? item.label : undefined}
                  aria-label={collapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    `nav-link-jv${collapsed ? " nav-link-jv--icon" : ""} ${isActive ? "active" : ""}`.trim()
                  }
                >
                  <Icon size={18} />
                  {!collapsed && <span>{item.label}</span>}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <a
        href={BUY_ME_A_COFFEE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={`sidebar-donate-link${collapsed ? " sidebar-donate-link--icon" : ""}`}
        title={collapsed ? "Buy me a coffee" : undefined}
        aria-label={collapsed ? "Buy me a coffee" : undefined}
      >
        <CupHotFill size={18} />
        {!collapsed && <span>Buy me a coffee</span>}
      </a>

      {onToggleCollapse && (
        <button
          type="button"
          className={`sidebar-collapse-btn${collapsed ? " sidebar-collapse-btn--collapsed" : ""}`}
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : undefined}
        >
          {collapsed ? <ArrowBarRight size={16} /> : (
            <>
              <ArrowBarLeft size={16} />
              <span>Collapse sidebar</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
