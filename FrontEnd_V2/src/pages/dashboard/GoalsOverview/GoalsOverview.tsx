import { Link } from "react-router-dom";
import { CalendarCheck, Compass, Diagram3 } from "react-bootstrap-icons";

import { ROUTES } from "@/routes/RoutePaths";
import type { GoalDataShortResponse } from "@/api";
import "./GoalsOverview.scss";

interface Props {
  goals: GoalDataShortResponse[];
}

function formatGoalDate(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString();
}

export function GoalsOverview({ goals }: Props) {
  if (goals.length === 0) return null;

  return (
    <div className="dp-section">
      <div className="dp-section-head">
        <h2 className="dp-section-title">Goals Overview</h2>
        <span className="dp-section-chip">{goals.length} active</span>
        <Link to={ROUTES.MY_GOALS} className="dp-section-link">View all →</Link>
      </div>

      <div className="dp-goal-scroll-wrap">
        <div className="dp-goal-cards">
          {goals.map((goal) => {
            const progress = goal.milestones_total > 0
              ? Math.round((goal.milestones_completed / goal.milestones_total) * 100)
              : 0;
            return (
              <Link
                key={goal.id}
                to={ROUTES.MY_GOAL_DETAIL.replace(":goalId", String(goal.id))}
                className="dp-goal-card"
              >
                <div className="dp-goal-card-head mb-2">
                  <span className="dp-goal-title">{goal.title}</span>
                  <span className="dp-goal-category">{goal.category}</span>
                </div>
                <div className="dp-goal-progress-row mb-1">
                  <span>Progress</span>
                  <strong>{progress}%</strong>
                </div>
                <div className="progress mb-2" style={{ height: 6 }}>
                  <div className="progress-bar" style={{ width: `${progress}%` }} />
                </div>
                <div className="dp-goal-meta">
                  <div className="dp-goal-meta-left">
                    <span><Diagram3 size={12} /> {goal.milestones_completed}/{goal.milestones_total}</span>
                    <span><Compass size={12} /> {goal.habits_active}/{goal.habits_total}</span>
                  </div>
                  <span className="dp-goal-meta-date">
                    <CalendarCheck size={12} /> {formatGoalDate(goal.target_date)}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
