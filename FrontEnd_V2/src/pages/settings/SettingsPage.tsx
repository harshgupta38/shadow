import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowCounterclockwise, CheckLg, GearFill } from "react-bootstrap-icons";
import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { api, ApiError } from "@/api";
import type { FullSettings } from "@/api";
import { AppearanceCard } from "@/pages/settings/AppearanceCard/AppearanceCard";
import { NotificationsCard } from "@/pages/settings/NotificationsCard/NotificationsCard";
import { PrivacyCard } from "@/pages/settings/PrivacyCard/PrivacyCard";
import { AIBehaviorCard } from "@/pages/settings/AIBehaviorCard/AIBehaviorCard";
import { PlannerCard } from "@/pages/settings/PlannerCard/PlannerCard";
import { AccessibilityCard } from "@/pages/settings/AccessibilityCard/AccessibilityCard";
import { SettingsSkeleton } from "@/pages/settings/SettingsSkeleton/SettingsSkeleton";

import "@/pages/settings/SettingsPage.scss";

// ─── Helpers ─────────────────────────────────────────────────────────────────

type SectionKey = keyof FullSettings;

// ─── Page ─────────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const [settings, setSettings] = useState<FullSettings | null>(null);
  const [baseline, setBaseline] = useState<FullSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const { setThemePreference } = useTheme();
  const { success, error } = useToast();

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.settings.get();
      setSettings(data);
      setBaseline(data);
      setThemePreference(data.appearance.theme_preference);
    } catch {
      error("Could not load settings. Please refresh and try again.");
    } finally {
      setLoading(false);
    }
  }, [setThemePreference, error]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  function patch<K extends SectionKey>(key: K, value: FullSettings[K]) {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  const dirtySections = useMemo<SectionKey[]>(() => {
    if (!settings || !baseline) return [];
    return (Object.keys(settings) as SectionKey[]).filter(
      (key) => JSON.stringify(settings[key]) !== JSON.stringify(baseline[key]),
    );
  }, [settings, baseline]);

  const isDirty = dirtySections.length > 0;

  // Dispatch accessibility:sync on any local change so AccessibilityContext applies it live.
  // Also fires on Restore (settings reverts to baseline) and on Save (dispatched again, idempotent).
  useEffect(() => {
    if (settings?.accessibility) {
      window.dispatchEvent(new CustomEvent("accessibility:sync", { detail: settings.accessibility }));
    }
  }, [settings?.accessibility]);

  const saveAll = useCallback(async () => {
    if (!settings || !isDirty) return;
    setSaving(true);
    try {
      const saved = await api.settings.update(settings);
      setSettings(saved);
      setBaseline(saved);
      setThemePreference(saved.appearance.theme_preference);
      window.dispatchEvent(new CustomEvent("planner:sync", { detail: saved.planner }));
      window.dispatchEvent(new CustomEvent("accessibility:sync", { detail: saved.accessibility }));
      success("Settings saved.");
    } catch (err) {
      error(err instanceof ApiError ? err.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }, [settings, isDirty, setThemePreference, success, error]);

  function restore() {
    if (!baseline) return;
    setSettings(baseline);
    setThemePreference(baseline.appearance.theme_preference);
  }

  const saveBar = isDirty ? (
    <div className="st-save-bar">
      <button
        type="button"
        className="btn btn-sm btn-ghost"
        onClick={restore}
        disabled={saving}
      >
        <ArrowCounterclockwise size={14} className="me-1" />
        Restore
      </button>
      <button
        type="button"
        className="btn btn-sm btn-brand"
        onClick={() => void saveAll()}
        disabled={saving}
      >
        {saving ? (
          <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />
        ) : (
          <CheckLg size={14} className="me-1" />
        )}
        Save
      </button>
    </div>
  ) : undefined;

  return (
    <section className="settings-page">
      <PageHeader
        icon={<GearFill size={20} />}
        title="Settings"
        subtitle="Manage your account preferences and application behavior."
        rightSlot={saveBar}
      />

      {isDirty && (
        <div className="st-float-actions d-flex d-lg-none">
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={restore}
            disabled={saving}
          >
            <ArrowCounterclockwise size={14} className="me-1" />
            Restore
          </button>
          <button
            type="button"
            className="btn btn-sm btn-brand"
            onClick={() => void saveAll()}
            disabled={saving}
          >
            {saving ? (
              <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />
            ) : (
              <CheckLg size={14} className="me-1" />
            )}
            Save
          </button>
        </div>
      )}

      {loading ? (
        <SettingsSkeleton />
      ) : settings ? (
        <div className="row g-3">
          {/* ── Left column ── */}
          <div className="col-xl-6 d-flex flex-column gap-3">
            <AppearanceCard
              data={settings.appearance}
              isDirty={dirtySections.includes("appearance")}
              onUpdate={(d) => {
                patch("appearance", d);
                // light / dark / browser apply instantly (no API call needed).
                // dynamic waits for Save so we don't trigger geolocation prematurely.
                if (d.theme_preference !== "dynamic") {
                  setThemePreference(d.theme_preference);
                }
              }}
            />
            <NotificationsCard
              data={settings.notifications}
              isDirty={dirtySections.includes("notifications")}
              onUpdate={(d) => patch("notifications", d)}
            />
            <PrivacyCard
              data={settings.privacy}
              isDirty={dirtySections.includes("privacy")}
              onUpdate={(d) => patch("privacy", d)}
            />
          </div>

          {/* ── Right column ── */}
          <div className="col-xl-6 d-flex flex-column gap-3">
            <AIBehaviorCard
              data={settings.ai_behavior}
              isDirty={dirtySections.includes("ai_behavior")}
              onUpdate={(d) => patch("ai_behavior", d)}
            />
            <PlannerCard
              data={settings.planner}
              isDirty={dirtySections.includes("planner")}
              onUpdate={(d) => patch("planner", d)}
            />
            <AccessibilityCard
              data={settings.accessibility}
              isDirty={dirtySections.includes("accessibility")}
              onUpdate={(d) => patch("accessibility", d)}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
