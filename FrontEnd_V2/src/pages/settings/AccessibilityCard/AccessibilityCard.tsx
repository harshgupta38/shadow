import { Sliders } from "react-bootstrap-icons";
import type { AccessibilitySettings } from "@/api";
import { Card, ToggleRow } from "@/pages/settings/SettingsShared";
import "@/pages/settings/AccessibilityCard/AccessibilityCard.scss";

export function AccessibilityCard({
  data,
  isDirty,
  onUpdate,
}: {
  data: AccessibilitySettings;
  isDirty: boolean;
  onUpdate: (d: AccessibilitySettings) => void;
}) {
  function set<K extends keyof AccessibilitySettings>(key: K, value: AccessibilitySettings[K]) {
    onUpdate({ ...data, [key]: value });
  }

  return (
    <Card
      className="accessibility-card"
      icon={<Sliders size={16} />}
      title="Accessibility"
      desc="Adjust Shadow to suit your visual and motion preferences."
      isDirty={isDirty}
    >
      <ToggleRow
        label="Reduce motion"
        description="Minimize animations and transitions throughout the app"
        checked={data.accessibility_reduced_motion}
        onChange={(v) => set("accessibility_reduced_motion", v)}
      />
      <ToggleRow
        label="High contrast"
        description="Increase visual contrast to improve readability"
        checked={data.accessibility_high_contrast}
        onChange={(v) => set("accessibility_high_contrast", v)}
      />

      <div className="st-range-field">
        <div className="st-range-header">
          <span className="st-field-label">Font size</span>
          <span className="st-scale-badge">{data.accessibility_font_scale_percent}%</span>
        </div>
        <input
          type="range"
          className="form-range st-range"
          min={80}
          max={140}
          step={5}
          value={data.accessibility_font_scale_percent}
          onChange={(e) => set("accessibility_font_scale_percent", Number(e.target.value))}
          aria-label={`Font size: ${data.accessibility_font_scale_percent}%`}
        />
        <div className="st-range-labels">
          <span>80%</span>
          <span>Default (100%)</span>
          <span>140%</span>
        </div>
      </div>
    </Card>
  );
}
