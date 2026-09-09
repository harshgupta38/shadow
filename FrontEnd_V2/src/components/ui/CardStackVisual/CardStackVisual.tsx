import "./CardStackVisual.scss";

/**
 * The tilted, gently-swaying "Today / Progress / Streak" card fan used as the
 * hero visual on the landing page and reused on the auth screens — the one
 * recognizable illustration for "this is Shadow" wherever a decorative,
 * on-brand visual is needed instead of a real product screenshot.
 */
export function CardStackVisual() {
  return (
    <div className="card-stack" aria-hidden="true">
      <div className="card-stack-card card-stack-card--today">
        <p className="card-stack-title">Today</p>
        <div className="card-stack-row">
          <span className="card-stack-check">✓</span> Morning workout
        </div>
        <div className="card-stack-row">
          <span className="card-stack-check">✓</span> Read 20 pages
        </div>
        <div className="card-stack-row">
          <span className="card-stack-check card-stack-check--pending">○</span> Deep work block
        </div>
      </div>

      <div className="card-stack-card card-stack-card--progress">
        <p className="card-stack-title">Progress</p>
        <div className="card-stack-ring">
          <svg className="card-stack-ring-svg" viewBox="0 0 62 62">
            <defs>
              <linearGradient id="cardStackRingGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="var(--jv-brand-1)" />
                <stop offset="100%" stopColor="var(--jv-brand-2)" />
              </linearGradient>
            </defs>
            <circle className="card-stack-ring-track" cx={31} cy={31} r={26} fill="none" strokeWidth={6} />
            <circle
              className="card-stack-ring-value"
              cx={31} cy={31} r={26} fill="none" strokeWidth={6}
              stroke="url(#cardStackRingGradient)"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 26}
              strokeDashoffset={2 * Math.PI * 26 * (1 - 0.64)}
            />
          </svg>
          <span className="card-stack-ring-pct">64%</span>
        </div>
        <p className="card-stack-sub">9 of 14 done</p>
      </div>

      <div className="card-stack-card card-stack-card--streak">
        <p className="card-stack-flame">🔥 11</p>
        <p className="card-stack-sub">day streak</p>
      </div>
    </div>
  );
}
