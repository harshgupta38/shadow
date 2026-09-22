import { Stars } from "react-bootstrap-icons";

import "@/components/ui/RouteFallback/RouteFallback.scss";

/** Suspense fallback shown while a lazy route chunk is downloading. */
export function RouteFallback() {
  return (
    <div className="route-fallback" role="status" aria-label="Loading">
      <div className="route-fallback-mark">
        <span className="route-fallback-ring" aria-hidden="true" />
        <Stars size={22} />
      </div>
      <p className="route-fallback-text">
        Loading
        <span className="route-fallback-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </p>
    </div>
  );
}
