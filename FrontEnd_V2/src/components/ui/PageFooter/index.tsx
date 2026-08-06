import type { ReactNode } from "react";

import "./PageFooter.scss";

interface PageFooterAction {
  key: string;
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  isActive?: boolean;
  itemClassName?: string;
}

interface PageFooterProps {
  actions: PageFooterAction[];
  ariaLabel?: string;
}

export function PageFooter({ actions, ariaLabel = "Page quick actions" }: PageFooterProps) {
  return (
    <div className="page-footer d-lg-none" aria-label={ariaLabel}>
      <div className="page-footer-inner">
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            className={`page-footer-item ${action.isActive ? "active" : ""} ${action.itemClassName ?? ""}`.trim()}
            onClick={action.onClick}
          >
            {action.icon && <span className="page-footer-btn-icon">{action.icon}</span>}
            <span className="page-footer-btn-label">{action.label}</span>
          </button>
        ))}
      </div>
      <div className="page-footer-home-indicator" aria-hidden="true" />
    </div>
  );
}
