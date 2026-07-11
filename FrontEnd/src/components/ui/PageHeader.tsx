import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  /** Right-aligned actions (buttons, toggles). */
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, icon, actions }: PageHeaderProps) {
  return (
    <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3 mb-sm-4">
      <div className="d-flex align-items-center gap-3">
        {icon && <div className="stat-icon">{icon}</div>}
        <div>
          <h1 className="page-title h3 mb-1 fw-bold">{title}</h1>
          {subtitle && <p className="page-subtitle text-muted-2 mb-0">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="d-flex align-items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
