import { useEffect, useState } from "react";
import { BarChartFill, CalendarCheckFill } from "react-bootstrap-icons";
import { Link } from "react-router-dom";

import { api, ApiError, type DashboardResponse } from "@/api";
import { ROUTES } from "@/routes/RoutePaths";
import { useAuth } from "@/context/AuthContext";
import { IllustratedErrorState } from "@/components/ui/IllustratedErrorState/IllustratedErrorState";
import { TodaySnapshot } from "./TodaySnapshot/TodaySnapshot";
import { ReportsOverview } from "./ReportsOverview/ReportsOverview";
import { GoalsOverview } from "./GoalsOverview/GoalsOverview";
import { UpcomingPanel } from "./UpcomingPanel/UpcomingPanel";
import { ThisWeekPanel } from "./ThisWeekPanel/ThisWeekPanel";
import { greeting } from "./DashboardPage.constants";
import "./DashboardPage.scss";

// ── Ghost Shell (loading placeholder, shaped like Today's Snapshot) ──────────

const GHOST_STATS = 4;
const GHOST_ITEM_WIDTHS = [72, 58, 65];

function DashboardGhostShell() {
  return (
    <div className="dp-empty" role="status" aria-live="polite">
      <div className="dp-empty-ghost-shell">
        <div className="dp-section-head">
          <span className="dp-ghost-line" style={{ width: 150, height: 14 }} />
          <span className="dp-ghost-line ms-auto" style={{ width: 90, height: 11 }} />
        </div>

        <div className="dp-stats">
          {Array.from({ length: GHOST_STATS }).map((_, i) => (
            <div key={i} className="dp-stat">
              <span className="dp-ghost-val" />
              <div className="dp-stat-text">
                <span className="dp-ghost-line" style={{ width: "70%" }} />
                <span className="dp-ghost-line" style={{ width: "50%" }} />
              </div>
            </div>
          ))}
        </div>

        <div className="dp-today-grid">
          <div className="dp-today-list">
            {GHOST_ITEM_WIDTHS.map((w, i) => (
              <div key={i} className="dp-today-item">
                <span className="dp-today-item-dot dp-ghost-dot" />
                <div className="dp-today-item-body">
                  <span className="dp-ghost-line" style={{ width: `${w}%` }} />
                  <span className="dp-ghost-line" style={{ width: "40%" }} />
                </div>
              </div>
            ))}
          </div>
          <div className="dp-today-ring-panel">
            <span className="dp-ghost-ring" />
            <span className="dp-ghost-line" style={{ width: "60%" }} />
          </div>
        </div>
      </div>

      <div className="dp-empty-core">
        <div className="dp-empty-icon"><span className="dp-loading-spinner" /></div>
        <h3 className="dp-empty-title">Loading your dashboard…</h3>
        <p className="dp-empty-sub">Fetching today's data, just a moment.</p>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const firstName = user?.name?.split(" ")[0] ?? "there";

  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    api.dashboard.get()
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load the dashboard."))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  return (
    <section className="dashboard-page">
      <div className="dp-welcome">
        <div className="dp-welcome-text">
          <h1 className="dp-welcome-title">{greeting()}, {firstName}</h1>
          <p className="dp-welcome-subtitle">Here's your momentum today. Small steps that add up.</p>
        </div>
        <div className="dp-welcome-actions">
          <Link to={ROUTES.PLAN} className="btn btn-soft">
            <CalendarCheckFill size={15} className="me-1" /> Today's Plan
          </Link>
          <Link to={ROUTES.REPORTS} className="btn btn-brand">
            <BarChartFill size={15} className="me-1" /> Reports
          </Link>
        </div>
      </div>

      {loading && <DashboardGhostShell />}

      {!loading && error && <IllustratedErrorState onRetry={load} />}

      {!loading && !error && data && (
        <>
          <TodaySnapshot
            items={data.today_items}
            currentStreak={data.latest_report?.stats.best_streak ?? 0}
            latestAlignmentScore={data.latest_report?.alignment_score ?? 0}
          />

          {data.latest_report && (
            <div className="mt-4">
              <ReportsOverview monthDays={data.month_days} latestReport={data.latest_report} />
            </div>
          )}

          {data.goals.length > 0 && (
            <div className="mt-4">
              <GoalsOverview goals={data.goals} />
            </div>
          )}

          <div className="dp-coming-up-grid mt-4">
            <UpcomingPanel items={data.upcoming} />
            <ThisWeekPanel habits={data.week_habits} />
          </div>
        </>
      )}
    </section>
  );
}
