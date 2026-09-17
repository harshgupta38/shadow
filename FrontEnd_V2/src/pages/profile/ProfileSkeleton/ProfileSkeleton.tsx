import "@/pages/profile/ProfileSkeleton/ProfileSkeleton.scss";

export function ProfileSkeleton() {
  return (
    <div className="profile-skeleton" aria-busy="true" aria-label="Loading profile">
      <div className="pf-skel-hero surface">
        <div className="pf-skel pf-skel--avatar" />
        <div className="pf-skel-hero-text">
          <div className="pf-skel pf-skel--name" />
          <div className="pf-skel pf-skel--meta" />
          <div className="pf-skel pf-skel--bio" />
        </div>
      </div>

      <div className="pf-skel-stats">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="pf-skel pf-skel--stat" />
        ))}
      </div>

      <div className="row g-3">
        <div className="col-xl-7">
          <div className="pf-skel-card surface">
            <div className="pf-skel pf-skel--title" />
            <div className="pf-skel pf-skel--desc" />
            <div className="pf-skel pf-skel--grid" />
          </div>
        </div>

        <div className="col-xl-5 d-flex flex-column gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="pf-skel-card surface">
              <div className="pf-skel pf-skel--title" />
              <div className="pf-skel pf-skel--desc" />
              <div className="pf-skel pf-skel--row" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
