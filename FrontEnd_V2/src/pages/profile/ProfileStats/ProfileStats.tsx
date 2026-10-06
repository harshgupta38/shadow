import type { ProfileResponse } from "@/api";
import "@/pages/profile/ProfileStats/ProfileStats.scss";

export function ProfileStats({ profile }: { profile: ProfileResponse }) {
  return (
    <div className="pf-stats">
      <div className="pf-stat pf-stat--warn">
        <span className="pf-stat-val">🔥 {profile.streak_days}</span>
        <div className="pf-stat-text">
          <span className="pf-stat-name">Current Streak</span>
          <span className="pf-stat-hint">consecutive days</span>
        </div>
      </div>
      <div className="pf-stat pf-stat--brand">
        <span className="pf-stat-val">{profile.goals_completed}</span>
        <div className="pf-stat-text">
          <span className="pf-stat-name">Goals Achieved</span>
          <span className="pf-stat-hint">lifetime completions</span>
        </div>
      </div>
      <div className="pf-stat pf-stat--success">
        <span className="pf-stat-val">{profile.habits_active}</span>
        <div className="pf-stat-text">
          <span className="pf-stat-name">Active Habits</span>
          <span className="pf-stat-hint">building consistency</span>
        </div>
      </div>
      <div className="pf-stat pf-stat--info">
        <span className="pf-stat-val">{profile.tasks_completed_total}</span>
        <div className="pf-stat-text">
          <span className="pf-stat-name">Tasks Completed</span>
          <span className="pf-stat-hint">all-time total</span>
        </div>
      </div>
    </div>
  );
}
