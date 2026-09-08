import { BarChartFill, CalendarCheckFill } from "react-bootstrap-icons";
import { Link } from "react-router-dom";

import { ROUTES } from "@/routes/RoutePaths";
import { useAuth } from "@/context/AuthContext";
import { TodaySnapshot } from "./TodaySnapshot/TodaySnapshot";
import { ReportsOverview } from "./ReportsOverview/ReportsOverview";
import { GoalsOverview } from "./GoalsOverview/GoalsOverview";
import { UpcomingPanel } from "./UpcomingPanel/UpcomingPanel";
import { ThisWeekPanel } from "./ThisWeekPanel/ThisWeekPanel";
import { greeting } from "./DashboardPage.constants";
import { MOCK_DASHBOARD_DATA } from "./DashboardPage.mock";
import "./DashboardPage.scss";

export function DashboardPage() {
  const { user } = useAuth();
  const firstName = user?.name?.split(" ")[0] ?? "there";

  // TODO: replace with a real fetch once the single dashboard endpoint exists —
  // every widget below already consumes exactly this DashboardResponse shape.
  const data = MOCK_DASHBOARD_DATA;

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
    </section>
  );
}
