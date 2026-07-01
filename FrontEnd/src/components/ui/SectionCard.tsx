import type { ReactNode } from "react";

interface SectionCardProps {
  title?: ReactNode;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  padding?: boolean;
}

/** A titled surface card used throughout the app for consistent sections. */
export function SectionCard({
  title,
  subtitle,
  actions,
  children,
  className = "",
  bodyClassName = "",
  padding = true,
}: SectionCardProps) {
  return (
    <section className={`surface ${className}`.trim()}>
      {(title || actions) && (
        <header className="d-flex align-items-center justify-content-between gap-2 px-3 px-sm-4 pt-3 pt-sm-4 pb-2">
          <div>
            {title && <h2 className="h6 fw-bold mb-0">{title}</h2>}
            {subtitle && <p className="text-muted-2 small mb-0 mt-1">{subtitle}</p>}
          </div>
          {actions && <div className="d-flex align-items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={`${padding ? "px-3 px-sm-4 pb-3 pb-sm-4" : ""} ${bodyClassName}`.trim()}>
        {children}
      </div>
    </section>
  );
}
