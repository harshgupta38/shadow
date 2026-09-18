import "./CardStackVisual.scss";

export function CardStackVisual() {
  return (
    <div className="card-stack" aria-hidden="true">

      {/* Card 1 — Deployment status (left, tilted -7°) */}
      <div className="cs-card cs-card--deploy">
        <div className="cs-card-header">
          <span className="cs-dot cs-dot--success" />
          <span className="cs-label">Last Deployment</span>
        </div>
        <div className="cs-tag">v2.4.1 · Both targets</div>
        <div className="cs-rows">
          <span className="cs-row cs-row--done">✓ Frontend deployed</span>
          <span className="cs-row cs-row--done">✓ Backend deployed</span>
          <span className="cs-row cs-row--muted">142s · 18 Sep 2026</span>
        </div>
      </div>

      {/* Card 2 — Server health (top right, tilted +5°) */}
      <div className="cs-card cs-card--health">
        <div className="cs-card-header">
          <span className="cs-dot cs-dot--success" />
          <span className="cs-label">Server</span>
        </div>
        <div className="cs-metric">
          <span className="cs-metric-val">24<span className="cs-metric-unit">%</span></span>
          <span className="cs-metric-label">CPU</span>
        </div>
        <div className="cs-pill cs-pill--online">● Online · 10d uptime</div>
      </div>

      {/* Card 3 — DB backup (bottom right, tilted -4°) */}
      <div className="cs-card cs-card--backup">
        <div className="cs-card-header">
          <span className="cs-dot cs-dot--success" />
          <span className="cs-label">DB Backup</span>
        </div>
        <div className="cs-rows">
          <span className="cs-row cs-row--done">✓ Today · 02:00 AM</span>
          <span className="cs-row cs-row--muted">14.2 MB · Auto</span>
        </div>
      </div>

    </div>
  );
}
