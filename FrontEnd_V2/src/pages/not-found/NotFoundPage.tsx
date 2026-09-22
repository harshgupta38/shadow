import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, HouseDoorFill } from "react-bootstrap-icons";

import { ThemeToggle } from "@/components/ui/ThemeToggle/ThemeToggle";
import { ROUTES } from "@/routes/RoutePaths";
import "@/pages/not-found/NotFoundPage.scss";

function LostCompassIllustration() {
  return (
    <svg
      className="notfound-page-svg"
      viewBox="0 0 400 300"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Compass sitting on a torn map, pointing away from a dashed trail"
    >
      <defs>
        <linearGradient id="nfCompassGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--jv-brand-1)" />
          <stop offset="100%" stopColor="var(--jv-brand-2)" />
        </linearGradient>
      </defs>

      {/* map card */}
      <g transform="rotate(-4 200 150)">
        <rect x="70" y="55" width="260" height="190" rx="14" className="notfound-page-svg-map" />
        <path
          d="M110 200 C 150 160, 160 120, 210 110 S 280 150, 300 95"
          className="notfound-page-svg-trail"
          fill="none"
          strokeLinecap="round"
          strokeDasharray="2 14"
        />
        <circle cx="110" cy="200" r="5" className="notfound-page-svg-dot" />
        <circle cx="210" cy="110" r="5" className="notfound-page-svg-dot" />
        <g transform="translate(300 95)">
          <path
            d="M0 -18c9 0 16 7 16 16 0 12-16 26-16 26s-16-14-16-26c0-9 7-16 16-16z"
            className="notfound-page-svg-pin"
          />
          <text x="0" y="2" textAnchor="middle" className="notfound-page-svg-pin-mark">?</text>
        </g>
      </g>

      {/* compass */}
      <g transform="translate(150 168)">
        <circle r="54" fill="url(#nfCompassGrad)" className="notfound-page-svg-compass-shadow" />
        <circle r="46" className="notfound-page-svg-compass-face" />
        <g className="notfound-page-svg-compass-ticks">
          <line x1="0" y1="-40" x2="0" y2="-32" />
          <line x1="0" y1="40" x2="0" y2="32" />
          <line x1="-40" y1="0" x2="-32" y2="0" />
          <line x1="40" y1="0" x2="32" y2="0" />
        </g>
        <path d="M0 -24 L9 8 L0 20 L-9 8 Z" className="notfound-page-svg-needle-n" transform="rotate(28)" />
        <path d="M0 24 L9 -8 L0 -20 L-9 -8 Z" className="notfound-page-svg-needle-s" transform="rotate(28)" />
        <circle r="5" className="notfound-page-svg-compass-pin" />
      </g>

      {/* floating specks */}
      <circle cx="60" cy="90" r="3" className="notfound-page-svg-speck" />
      <circle cx="345" cy="200" r="4" className="notfound-page-svg-speck" />
      <circle cx="325" cy="60" r="2.5" className="notfound-page-svg-speck" />
    </svg>
  );
}

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="notfound-page">
      <div className="notfound-page-topbar">
        <ThemeToggle />
      </div>

      <div className="notfound-page-illustration">
        <LostCompassIllustration />
      </div>

      <p className="notfound-page-code">404</p>
      <h1 className="notfound-page-title">Looks like you wandered off the trail</h1>
      <p className="notfound-page-text">
        The page you're looking for doesn't exist or may have moved. Let's get you back on track.
      </p>

      <div className="notfound-page-actions">
        <Link to={ROUTES.DASHBOARD} className="btn btn-brand notfound-page-cta">
          <HouseDoorFill /> Back to Dashboard
        </Link>
        <button type="button" className="btn btn-outline-secondary notfound-page-secondary" onClick={() => navigate(-1)}>
          <ArrowLeft /> Go Back
        </button>
      </div>
    </div>
  );
}
