import { Link } from "react-router-dom";
import { BellFill, ChevronRight, GearFill, Laptop, Palette2, Robot } from "react-bootstrap-icons";

import { ROUTES } from "@/routes/RoutePaths";
import { Panel } from "@/pages/profile/Panel/Panel";
import "@/pages/profile/AppPreferencesPanel/AppPreferencesPanel.scss";

const SETTINGS_SHORTCUTS = [
  { icon: <Palette2 size={15} />, label: "Appearance & Theme", hint: "Light, dark, or dynamic mode" },
  { icon: <BellFill size={15} />, label: "Notifications", hint: "What Shadow notifies you about" },
  { icon: <Robot size={15} />, label: "AI Behavior", hint: "Tune how your coach responds" },
  { icon: <Laptop size={15} />, label: "Active Sessions", hint: "Devices signed in to your account" },
];

export function AppPreferencesPanel() {
  return (
    <Panel
      icon={<GearFill size={18} />}
      tone="violet"
      title="App Preferences"
      desc="Jump straight to the settings you tune most often."
    >
      <div className="pf-shortcut-list">
        {SETTINGS_SHORTCUTS.map((s) => (
          <Link key={s.label} to={ROUTES.SETTINGS} className="pf-shortcut-row">
            <span className="pf-shortcut-icon">{s.icon}</span>
            <div className="pf-shortcut-text">
              <span className="pf-shortcut-label">{s.label}</span>
              <span className="pf-shortcut-hint">{s.hint}</span>
            </div>
            <ChevronRight size={14} className="pf-shortcut-chevron" />
          </Link>
        ))}
      </div>
    </Panel>
  );
}
