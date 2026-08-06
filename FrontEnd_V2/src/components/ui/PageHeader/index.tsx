import type { ReactNode } from "react";
import { ThreeDotsVertical } from "react-bootstrap-icons";

import "./PageHeader.scss";

type PageHeaderActionTone = "brand" | "soft" | "danger" | "none";

export interface PageHeaderAction {
    key: string;
    label: string;
    icon?: ReactNode;
    onClick?: () => void;
    desktopTone?: PageHeaderActionTone;
    mobileTone?: PageHeaderActionTone;
    tone?: PageHeaderActionTone;
    className?: string;
}

interface PageHeaderProps {
    title: string;
    subtitle?: string;
    icon?: ReactNode;
    actions?: PageHeaderAction[];
}

const DESKTOP_TONE_CLASS: Record<PageHeaderActionTone, string> = {
    none: "",
    brand: "btn-brand",
    soft: "btn-soft",
    danger: "btn-outline-secondary text-danger",
};

const MOBILE_TONE_CLASS: Record<PageHeaderActionTone, string> = {
    brand: "is-brand",
    soft: "is-soft",
    danger: "is-danger",
    none: "is-none",
};

export function PageHeader({ title, subtitle, icon, actions }: PageHeaderProps) {
    return (
        <div className="page-header-jv d-flex flex-nowrap align-items-center justify-content-between gap-3 mb-3 mb-sm-4">
            <div className="page-header-jv-main d-flex align-items-center gap-3 min-w-0">
                {icon && <div className="stat-icon">{icon}</div>}
                <div className="min-w-0">
                    <h1 className="page-title h3 mb-1 fw-bold">{title}</h1>
                    {subtitle && <p className="page-subtitle text-muted-2 mb-0">{subtitle}</p>}
                </div>
            </div>

            {!!actions?.length && (
                <div className="d-none d-lg-flex align-items-center gap-2 flex-nowrap flex-shrink-0">
                    {actions.map((action) => {
                        const desktopTone = action.desktopTone ?? action.tone ?? "soft";

                        return (
                            <button
                                key={action.key}
                                type="button"
                                className={`btn text-nowrap flex-shrink-0 ${DESKTOP_TONE_CLASS[desktopTone]} ${action.className ?? ""}`.trim()}
                                onClick={action.onClick}
                            >
                                {action.icon && <span className="me-1 d-inline-flex">{action.icon}</span>}
                                {action.label}
                            </button>
                        );
                    })}
                </div>
            )}

            {!!actions?.length && (
                <details className="page-header-mobile-menu d-lg-none">
                    <summary className="btn btn-ghost btn-icon" aria-label="Open page actions">
                        <ThreeDotsVertical size={18} />
                    </summary>
                    <div className="page-header-mobile-actions" role="menu" aria-label="Page actions">
                        {actions.map((action) => {
                            const mobileTone = action.mobileTone ?? action.tone ?? "soft";

                            return (
                                <button
                                    key={action.key}
                                    type="button"
                                    role="menuitem"
                                    className={`page-header-mobile-action-item p-0 ${MOBILE_TONE_CLASS[mobileTone]}`.trim()}
                                    onClick={action.onClick}
                                >
                                    {action.icon && <span className="page-header-mobile-action-icon">{action.icon}</span>}
                                    <span>{action.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </details>
            )}
        </div>
    );
}
