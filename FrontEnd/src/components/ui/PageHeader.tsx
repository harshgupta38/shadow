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
    <div className="d-flex flex-wrap align-items-start justify-content-between gap-3 mb-4">
      <div className="d-flex align-items-center gap-3">
        {icon && <div className="stat-icon">{icon}</div>}
        <div>
          <h1 className="h3 mb-1 fw-bold">{title}</h1>
          {subtitle && <p className="text-muted-2 mb-0">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="d-flex align-items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
