import { NavLink } from "react-router-dom";

import { NAV_SECTIONS } from "@/constant/nav";
import { Brand } from "@/components/ui/Brand";

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  return (
    <div className="d-flex flex-column h-100">
      <div className="d-none d-lg-block px-2 mb-3">
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
    </div>
  );
}