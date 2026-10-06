import { useState } from "react";
import { NavLink } from "react-router-dom";
import { ArrowBarLeft, ArrowBarRight, ChevronRight } from "react-bootstrap-icons";
import { NAV_SECTIONS, type HttpMethod, type NavTreeFolder } from "@/constant/nav";

interface SidebarProps {
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

function MethodBadge({ method }: { method: HttpMethod }) {
  return (
    <span className={`nav-tree-method nav-tree-method--${method.toLowerCase()}`}>
      {method}
    </span>
  );
}

function TreeFolder({ folder }: { folder: NavTreeFolder }) {
  const [open, setOpen] = useState(false);
  const Icon = folder.icon;

  return (
    <div className="nav-tree-folder">
      <button
        type="button"
        className="nav-tree-folder-row"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <ChevronRight size={12} className={`nav-tree-chevron${open ? " nav-tree-chevron--open" : ""}`} />
        <Icon size={15} />
        <span>{folder.label}</span>
      </button>

      {open && (
        <div className="nav-tree-children">
          {folder.children.map((leaf) => (
            <div key={leaf.label} className="nav-tree-leaf">
              <MethodBadge method={leaf.method} />
              <span>{leaf.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
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

            {section.items?.map((item) => {
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
                    `nav-link-jv${collapsed ? " nav-link-jv--icon" : ""}${isActive ? " active" : ""}`.trim()
                  }
                >
                  <Icon size={18} />
                  {!collapsed && <span>{item.label}</span>}
                </NavLink>
              );
            })}

            {/* The Controller tree only renders expanded — a nested,
                multi-level tree has no sensible icon-only collapsed form. */}
            {!collapsed &&
              section.tree?.map((folder) => <TreeFolder key={folder.label} folder={folder} />)}
          </div>
        ))}
      </nav>

      {onToggleCollapse && (
        <button
          type="button"
          className={`sidebar-collapse-btn${collapsed ? " sidebar-collapse-btn--collapsed" : ""}`}
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : undefined}
        >
          {collapsed ? (
            <ArrowBarRight size={16} />
          ) : (
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
