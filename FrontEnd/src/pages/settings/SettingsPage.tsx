import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BoxArrowRight,
  Download,
  GearFill,
  MoonStarsFill,
  PersonFill,
  SunFill,
  UniversalAccessCircle,
} from "react-bootstrap-icons";

import { api, ApiError, type ThemePreference } from "@/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { useAuth } from "@/context/AuthContext";
import { useLogoutConfirm } from "@/context/LogoutConfirmContext";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { getReduceMotion, setReduceMotion } from "@/lib/preferences";

export function SettingsPage() {
  const { user, patchUser } = useAuth();
  const { requestLogout } = useLogoutConfirm();
  const { theme, setTheme } = useTheme();
  const toast = useToast();
  const navigate = useNavigate();

  const [reduceMotion, setReduceMotionState] = useState(getReduceMotion());
  const [exporting, setExporting] = useState(false);

  async function chooseTheme(next: ThemePreference) {
    setTheme(next);
    try {
      const updated = await api.profile.update({ theme_preference: next });
      patchUser(updated);
    } catch {
      /* theme still applies locally */
    }
  }

  function toggleReduceMotion() {
    const next = !reduceMotion;
    setReduceMotionState(next);
    setReduceMotion(next);
  }

  async function exportData() {
    setExporting(true);
    try {
      const [profile, memories] = await Promise.all([
        api.profile.get(),
        api.profile.memories(),
      ]);
      const payload = JSON.stringify({ profile, memories }, null, 2);
      const blob = new Blob([payload], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `shadow-data-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Your data is downloading.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't export your data.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Appearance, accessibility and account preferences."
        icon={<GearFill size={20} />}
      />

      <div className="row g-4">
        <div className="col-lg-6 d-flex flex-column gap-4">
          {/* Appearance */}
          <SectionCard title="Appearance" subtitle="Choose how Shadow looks.">
            <div className="row g-3">
              {(
                [
                  { value: "light" as ThemePreference, label: "Light", icon: SunFill },
                  { value: "dark" as ThemePreference, label: "Dark", icon: MoonStarsFill },
                ]
              ).map((option) => {
                const Icon = option.icon;
                const active = theme === option.value;
                return (
                  <div className="col-6" key={option.value}>
                    <button
                      type="button"
                      className="surface-2 w-100 p-3 border-0 d-flex align-items-center gap-2 clickable"
                      style={{
                        outline: active ? "2px solid var(--jv-brand-1)" : "2px solid transparent",
                      }}
                      onClick={() => chooseTheme(option.value)}
                    >
                      <span className="stat-icon" style={{ width: 38, height: 38 }}>
                        <Icon size={17} />
                      </span>
                      <span className="fw-semibold">{option.label}</span>
                      {active && <span className="ms-auto pill pill-brand">Active</span>}
                    </button>
                  </div>
                );
              })}
            </div>
          </SectionCard>

          {/* Accessibility */}
          <SectionCard
            title={
              <span className="d-inline-flex align-items-center gap-2">
                <UniversalAccessCircle size={16} style={{ color: "var(--jv-brand-1)" }} />{" "}
                Accessibility
              </span>
            }
            subtitle="Make Shadow more comfortable to use."
          >
            <div className="form-check form-switch d-flex align-items-center justify-content-between m-0 ps-0">
              <label className="form-check-label" htmlFor="reduce-motion">
                <span className="fw-semibold d-block">Reduce motion</span>
                <span className="text-muted-2 small">
                  Minimise animations and transitions across the app.
                </span>
              </label>
              <input
                id="reduce-motion"
                className="form-check-input ms-3 flex-shrink-0"
                type="checkbox"
                role="switch"
                checked={reduceMotion}
                onChange={toggleReduceMotion}
              />
            </div>
          </SectionCard>
        </div>

        <div className="col-lg-6 d-flex flex-column gap-4">
          {/* Data & privacy */}
          <SectionCard
            title={
              <span className="d-inline-flex align-items-center gap-2">
                <Download size={16} style={{ color: "var(--jv-brand-1)" }} /> Data &amp; privacy
              </span>
            }
            subtitle="Your data stays yours — take it with you anytime."
          >
            <div className="d-flex align-items-center justify-content-between gap-3">
              <div>
                <div className="fw-semibold">Export your data</div>
                <div className="text-muted-2 small">
                  Download your profile and everything Shadow remembers as JSON.
                </div>
              </div>
              <button
                className="btn btn-outline-secondary flex-shrink-0"
                onClick={exportData}
                disabled={exporting}
              >
                <Download size={16} className="me-1" /> {exporting ? "Preparing…" : "Export"}
              </button>
            </div>
          </SectionCard>

          {/* Account */}
          <SectionCard title="Account" subtitle="Manage your profile and session.">
            <div className="d-flex align-items-center justify-content-between mb-3 pb-3 border-bottom">
              <div>
                <div className="fw-semibold">Profile &amp; security</div>
                <div className="text-muted-2 small">Update your details, password or memory.</div>
              </div>
              <button className="btn btn-soft flex-shrink-0" onClick={() => navigate("/profile")}>
                <PersonFill size={16} className="me-1" /> Open profile
              </button>
            </div>
            <div className="d-flex align-items-center justify-content-between">
              <div>
                <div className="fw-semibold">Sign out</div>
                <div className="text-muted-2 small">You'll need to sign in again.</div>
              </div>
              <button className="btn btn-outline-secondary flex-shrink-0" onClick={requestLogout}>
                <BoxArrowRight size={16} className="me-1" /> Sign out
              </button>
            </div>
          </SectionCard>
        </div>
      </div>

      <div className="text-center text-faint small mt-4">Signed in as {user?.email}</div>
    </div>
  );
}
