import { Display, MoonStarsFill, PaletteFill, Stars, SunFill } from "react-bootstrap-icons";
import type { AppearanceSettings, ThemePreferenceValue } from "@/api";
import { CheckLg } from "react-bootstrap-icons";
import { Card } from "@/pages/settings/SettingsShared";
import "@/pages/settings/AppearanceCard/AppearanceCard.scss";

const THEME_CARDS: {
  value: ThemePreferenceValue;
  label: string;
  desc: string;
  icon: React.ReactNode;
}[] = [
  { value: "light",   label: "Light",   desc: "Clean, bright interface",        icon: <SunFill size={20} /> },
  { value: "dark",    label: "Dark",    desc: "Easy on the eyes at night",      icon: <MoonStarsFill size={20} /> },
  { value: "browser", label: "System",  desc: "Follows your OS preference",     icon: <Display size={20} /> },
  { value: "dynamic", label: "Dynamic", desc: "Switches with sunrise & sunset", icon: <Stars size={20} /> },
];

export function AppearanceCard({
  data,
  isDirty,
  onUpdate,
}: {
  data: AppearanceSettings;
  isDirty: boolean;
  onUpdate: (d: AppearanceSettings) => void;
}) {
  return (
    <Card
      className="appearance-card"
      icon={<PaletteFill size={16} />}
      title="Appearance"
      desc="Choose how Shadow looks on your device."
      isDirty={isDirty}
    >
      <div className="st-theme-grid">
        {THEME_CARDS.map((card) => (
          <button
            key={card.value}
            type="button"
            className={`st-theme-card${data.theme_preference === card.value ? " active" : ""}`}
            onClick={() => onUpdate({ theme_preference: card.value })}
            aria-pressed={data.theme_preference === card.value}
          >
            <span className="st-theme-icon">{card.icon}</span>
            <span className="st-theme-label">{card.label}</span>
            <span className="st-theme-desc">{card.desc}</span>
            {data.theme_preference === card.value && (
              <span className="st-theme-check" aria-hidden="true">
                <CheckLg size={9} />
              </span>
            )}
          </button>
        ))}
      </div>
    </Card>
  );
}
