import "@/pages/settings/SettingsSkeleton/SettingsSkeleton.scss";

export function SettingsSkeleton() {
  return (
    <div className="settings-skeleton row g-3" aria-busy="true" aria-label="Loading settings">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="col-xl-6">
          <div className="st-card-skeleton surface">
            <div className="st-skel st-skel--title" />
            <div className="st-skel st-skel--desc" />
            <div className="st-skel st-skel--row" />
            <div className="st-skel st-skel--row" />
            <div className="st-skel st-skel--row st-skel--short" />
          </div>
        </div>
      ))}
    </div>
  );
}
