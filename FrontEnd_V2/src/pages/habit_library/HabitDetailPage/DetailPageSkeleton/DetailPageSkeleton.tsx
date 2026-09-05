import "./DetailPageSkeleton.scss";

const GHOST_MONTHS = 12;
const GHOST_WEEKS = 5;
const GHOST_ROWS = [62, 48, 75, 55];

export function DetailPageSkeleton() {
  return (
    <div className="dps-wrap">

      {/* ── Ghost layout (fades out at bottom) ── */}
      <div className="dps-ghost-shell" aria-hidden="true">

        {/* Hero card ghost */}
        <div className="surface dps-ghost-hero">
          <div className="dps-ghost-ring" />
          <div className="dps-ghost-hero-content">
            <div className="dps-ghost-chips">
              <span className="dps-ghost-pill" style={{ width: 64 }} />
              <span className="dps-ghost-pill" style={{ width: 52 }} />
              <span className="dps-ghost-pill" style={{ width: 58 }} />
            </div>
            <span className="dps-ghost-line dps-ghost-line--title" />
            <span className="dps-ghost-line" style={{ width: "55%" }} />
          </div>
        </div>

        {/* Heatmap card ghost */}
        <div className="surface dps-ghost-card">
          <span className="dps-ghost-section-title" />
          <div className="dps-ghost-heatmap">
            {Array.from({ length: GHOST_MONTHS }).map((_, mi) => (
              <div key={mi} className="dps-ghost-hm-month">
                <span className="dps-ghost-hm-label" />
                <div className="dps-ghost-hm-grid">
                  {Array.from({ length: GHOST_WEEKS * 7 }).map((_, ci) => (
                    <span key={ci} className="dps-ghost-hm-cell" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* History card ghost */}
        <div className="surface dps-ghost-card">
          <span className="dps-ghost-month-hdr" />
          <div className="dps-ghost-history">
            {GHOST_ROWS.map((w, i) => (
              <div key={i} className="dps-ghost-history-row">
                <span className="dps-ghost-avatar" />
                <span className="dps-ghost-line" style={{ width: `${w}%` }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Centered spinner overlay ── */}
      <div className="dps-core">
        <div className="dps-icon">
          <span className="dps-spinner" />
        </div>
        <h3 className="dps-title">Loading…</h3>
        <p className="dps-sub">Fetching your data, just a moment.</p>
      </div>

    </div>
  );
}
