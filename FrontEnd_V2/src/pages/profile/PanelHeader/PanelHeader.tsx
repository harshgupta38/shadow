import type { ReactNode } from "react";
import type { ColorKey } from "@/api";
import "@/pages/profile/PanelHeader/PanelHeader.scss";

export interface PanelHeaderProps {
  icon: ReactNode;
  tone: ColorKey | "danger";
  title: string;
  desc: string;
}

export function PanelHeader({ icon, tone, title, desc }: PanelHeaderProps) {
  return (
    <div className="panel-header">
      <span className={`stat-icon panel-header-icon panel-header-icon--${tone}`}>{icon}</span>
      <div>
        <h3 className="panel-header-title">{title}</h3>
        <p className="panel-header-desc">{desc}</p>
      </div>
    </div>
  );
}
