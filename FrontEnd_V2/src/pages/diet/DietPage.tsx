import { useCallback, useEffect, useState } from "react";
import { EggFried } from "react-bootstrap-icons";
import { useSearchParams } from "react-router-dom";

import { api } from "@/api";
import type { DietProfile } from "@/api";
import { IllustratedErrorState } from "@/components/ui/IllustratedErrorState/IllustratedErrorState";
import { PageHeader } from "@/components/ui/PageHeader/PageHeader";
import { DiaryTab } from "@/pages/diet/DiaryTab/DiaryTab";
import { DietSkeleton } from "@/pages/diet/DietSkeleton/DietSkeleton";
import { LibraryTab } from "@/pages/diet/LibraryTab/LibraryTab";
import { OnboardingWizard } from "@/pages/diet/OnboardingWizard/OnboardingWizard";
import { OverviewTab } from "@/pages/diet/OverviewTab/OverviewTab";
import { tabKeyHandler } from "@/pages/diet/tabKeys";
import "./DietPage.scss";

type TabId = "overview" | "diary" | "library";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "diary", label: "Food diary" },
  { id: "library", label: "Food library" },
];

export function DietPage() {
  const [params, setParams] = useSearchParams();
  const [profile, setProfile] = useState<DietProfile | null>(null);
  const [onboarded, setOnboarded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const state = await api.diet.getProfile();
      setOnboarded(state.onboarded);
      setProfile(state.profile);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The tab lives in the URL so a refresh, the back button, or a link from another page lands on the right one.
  const requested = params.get("tab");
  const tab: TabId = TABS.some((t) => t.id === requested) ? (requested as TabId) : "overview";
  const selectTab = (id: TabId) => setParams(id === "overview" ? {} : { tab: id }, { replace: true });

  const header = (
    <PageHeader
      title="Diet"
      subtitle="Know what you eat, without overthinking it."
      icon={<EggFried />}
      actions={[]}
    />
  );

  if (loading) {
    return (
      <div className="dt-shell">
        {header}
        <div className="dt-loading" aria-hidden="true">
          <DietSkeleton height={48} />
          <DietSkeleton height={260} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dt-shell">
        {header}
        <IllustratedErrorState onRetry={() => { setLoading(true); void load(); }} />
      </div>
    );
  }

  // Not set up yet: the page offers the setup, and the wizard opens from that button, the way goal setup opens from the goals page.
  if (!onboarded && !setupOpen) {
    return (
      <div className="dt-shell">
        {header}
        <section className="surface dt-setup">
          <h2 className="dt-setup-title">Set up your nutrition</h2>
          <p className="dt-setup-subtitle">
            Tell Shadow a little about you, and it suggests daily targets for calories, protein, carbs, fat, fibre and water.
          </p>
          <button type="button" className="btn btn-brand dt-setup-cta" onClick={() => setSetupOpen(true)}>
            Setup Diet
          </button>
        </section>
      </div>
    );
  }

  // The wizard takes over the whole page while it is open, so it has no page header of its own.
  if (!onboarded || editingProfile) {
    return (
      <OnboardingWizard
        initial={editingProfile ? profile : null}
        onCancel={() => (editingProfile ? setEditingProfile(false) : setSetupOpen(false))}
        onDone={(saved) => {
          setProfile(saved);
          setOnboarded(true);
          setEditingProfile(false);
        }}
      />
    );
  }

  return (
    <div className="dt-shell">
      {header}

      <div className="dt-shell-tabs">
        <div
          className="nav-tabs-jv"
          role="tablist"
          aria-label="Diet sections"
          onKeyDown={tabKeyHandler(TABS.map((t) => t.id), tab, selectTab, (id) => `dt-tab-${id}`)}
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`dt-tab-${t.id}`}
              aria-selected={tab === t.id}
              tabIndex={tab === t.id ? 0 : -1}
              aria-controls="dt-tabpanel"
              className={`nav-tab-jv${tab === t.id ? " active" : ""}`}
              onClick={() => selectTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div id="dt-tabpanel" role="tabpanel" aria-labelledby={`dt-tab-${tab}`}>
        {tab === "overview" && <OverviewTab onLogFood={() => selectTab("diary")} />}
        {tab === "diary" && profile && <DiaryTab profile={profile} onEditProfile={() => setEditingProfile(true)} />}
        {tab === "library" && <LibraryTab />}
      </div>
    </div>
  );
}
