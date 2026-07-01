import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  message?: string;
  action?: ReactNode;
  compact?: boolean;
}

export function EmptyState({ icon, title, message, action, compact }: EmptyStateProps) {
  return (
    <div className="empty-state" style={compact ? { padding: "1.75rem 1rem" } : undefined}>
      {icon && <div className="empty-icon">{icon}</div>}
      <h3 className="h6 fw-bold text-body mb-1">{title}</h3>
      {message && <p className="mb-3 mx-auto" style={{ maxWidth: 360 }}>{message}</p>}
      {action}
    </div>
  );
}
