import type { ReactNode } from "react";
import type { ColorKey } from "@/api";
import { PanelHeader } from "@/pages/profile/PanelHeader/PanelHeader";
import "@/pages/profile/Panel/Panel.scss";

export interface PanelProps {
  icon: ReactNode;
  tone: ColorKey | "danger";
  title: string;
  desc: string;
  className?: string;
  children: ReactNode;
}

// A `surface` card that opens with a PanelHeader — the "icon-titled card"
// shape used across the Profile page (Achievements, This Month, App
// Preferences, Account & Security, Danger Zone all use this).
export function Panel({ icon, tone, title, desc, className, children }: PanelProps) {
  return (
    <div className={`surface panel-card${className ? ` ${className}` : ""}`}>
      <PanelHeader icon={icon} tone={tone} title={title} desc={desc} />
      {children}
    </div>
  );
}
