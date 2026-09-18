import { useEffect, useRef } from "react";
import { ThreeDotsVertical } from "react-bootstrap-icons";

export interface PageAction {
  key: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

interface PageHeaderProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  actions?: PageAction[];
}

export function PageHeader({ icon, title, subtitle, actions }: PageHeaderProps) {
  const hasActions = !!actions?.length;
  const mobileMenuRef = useRef<HTMLDetailsElement>(null);

  const closeMobileMenu = () => {
    mobileMenuRef.current?.removeAttribute("open");
  };

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      const menu = mobileMenuRef.current;
      if (!menu?.open) return;
      if (event.target instanceof Node && !menu.contains(event.target)) {
        closeMobileMenu();
      }
    }
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, []);

  return (
    <div className="page-header-jv d-flex flex-nowrap align-items-center justify-content-between gap-3 mb-3">
      <div className="page-header-jv-main d-flex align-items-center gap-3 min-w-0">
        <div className="stat-icon">{icon}</div>
        <div className="min-w-0">
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-subtitle text-muted-2 mb-0">{subtitle}</p>}
        </div>
      </div>

      {hasActions && (
        <>
          {/* Desktop CTA — hidden below lg */}
          <div className="d-none d-lg-flex align-items-center gap-2 flex-nowrap flex-shrink-0">
            {actions!.map((a) => (
              <button
                key={a.key}
                type="button"
                className="btn btn-brand text-nowrap flex-shrink-0"
                onClick={a.onClick}
                disabled={a.disabled}
              >
                <span className="me-1 mt-1 d-inline-flex">{a.icon}</span>
                {a.label}
              </button>
            ))}
          </div>

          {/* Mobile three-dot dropdown — visible below lg */}
          <details ref={mobileMenuRef} className="page-header-mobile-menu d-lg-none">
            <summary className="btn btn-ghost btn-icon" aria-label="Page actions">
              <ThreeDotsVertical size={18} />
            </summary>
            <div className="page-header-mobile-actions" role="menu">
              {actions!.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  role="menuitem"
                  className="page-header-mobile-action-item is-brand"
                  onClick={() => {
                    a.onClick();
                    closeMobileMenu();
                  }}
                  disabled={a.disabled}
                >
                  <span className="page-header-mobile-action-icon">{a.icon}</span>
                  <span>{a.label}</span>
                </button>
              ))}
            </div>
          </details>
        </>
      )}
    </div>
  );
}
